/**
 * Exporta una instantánea de PostgreSQL y la importa como registros de legado
 * en las tablas DynamoDB por dominio. No publica eventos ni elimina datos.
 *
 * Uso:
 *   AURORA_EXPORT_URL=... bun run tools/migration/aurora-dynamodb.ts export ./snapshot
 *   EDTECH_TABLE_IDENTITY_ACCESS=... ... bun run tools/migration/aurora-dynamodb.ts import ./snapshot
 *   EDTECH_TABLE_IDENTITY_ACCESS=... ... bun run tools/migration/aurora-dynamodb.ts verify ./snapshot
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { createGzip, createGunzip, gzipSync } from 'node:zlib'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import pg from 'pg'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { BatchWriteCommand, DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'

const DOMAINS = {
  identity: 'identity-access',
  catalog: 'catalog',
  enrollment: 'enrollment-progress',
  gamification: 'gamification',
  flashcards: 'flashcards',
  payments: 'payments',
  affiliates: 'affiliates',
  iot_terminals: 'iot-terminals',
} as const

type SourceSchema = keyof typeof DOMAINS
type SourceTable = { schema: SourceSchema; table: string; primaryKey: string[] }
type SnapshotRow = {
  schema: SourceSchema
  table: string
  primaryKey: string[]
  key: unknown[]
  data: Record<string, unknown>
  fingerprint: string
  duplicate: number
}
type SnapshotTable = SourceTable & { count: number; fingerprintDigest: string }
type SnapshotManifest = {
  version: 1
  snapshotId: string
  createdAt: string
  tables: SnapshotTable[]
}

const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`
const canonical = (value: unknown): string => {
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Buffer.isBuffer(value)) return JSON.stringify({ __bufferBase64: value.toString('base64') })
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`
  }
  if (typeof value === 'bigint') return JSON.stringify(value.toString())
  return JSON.stringify(value)
}

const jsonSafe = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return { __type: 'Buffer', base64: value.toString('base64') }
  if (Array.isArray(value)) return value.map(jsonSafe)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, jsonSafe(child)]),
    )
  }
  if (typeof value === 'bigint') return value.toString()
  return value
}

export const fingerprintRow = (row: Record<string, unknown>): string =>
  createHash('sha256').update(canonical(row)).digest('hex')

export const legacyPartitionKey = (schema: string, table: string, key: unknown[]): string => {
  const digest = createHash('sha256').update(canonical(key)).digest('hex')
  return `LEGACY#${schema}.${table}#${digest}`
}

export const stableLegacyRecordKey = (row: SnapshotRow): string =>
  legacyPartitionKey(
    row.schema,
    row.table,
    row.primaryKey.length ? row.key : ['ROW_HASH', row.fingerprint, row.duplicate],
  )

const writeWithBackpressure = async (
  stream: NodeJS.WritableStream,
  value: string,
): Promise<void> => {
  if (!stream.write(value)) await once(stream, 'drain')
}

const obtenerTablas = async (client: pg.PoolClient): Promise<SourceTable[]> => {
  const schemas = Object.keys(DOMAINS)
  const result = await client.query<{
    table_schema: SourceSchema
    table_name: string
    column_name: string
    ordinal_position: number
  }>(
    `SELECT tc.table_schema, tc.table_name, kcu.column_name, kcu.ordinal_position
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_catalog = kcu.constraint_catalog
        AND tc.constraint_schema = kcu.constraint_schema
        AND tc.constraint_name = kcu.constraint_name
        AND tc.table_name = kcu.table_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = ANY($1::text[])
      ORDER BY tc.table_schema, tc.table_name, kcu.ordinal_position`,
    [schemas],
  )
  const keys = new Map<string, string[]>()
  for (const row of result.rows) {
    const name = `${row.table_schema}.${row.table_name}`
    keys.set(name, [...(keys.get(name) ?? []), row.column_name])
  }
  const present = await client.query<{ table_schema: SourceSchema; table_name: string }>(
    `SELECT table_schema, table_name
       FROM information_schema.tables
      WHERE table_type = 'BASE TABLE' AND table_schema = ANY($1::text[])
      ORDER BY table_schema, table_name`,
    [schemas],
  )
  return present.rows.map(row => ({
    schema: row.table_schema,
    table: row.table_name,
    primaryKey: keys.get(`${row.table_schema}.${row.table_name}`) ?? [],
  }))
}

const cursorPredicate = (columns: string[], values: unknown[], placeholderStart = 1): string => {
  if (columns.length === 0) return `${quoteIdentifier('ctid')} > $${placeholderStart}::tid`
  if (columns.length === 1) return `${quoteIdentifier(columns[0]!)} > $${placeholderStart}`
  return columns
    .map((column, index) => {
      const equality = columns
        .slice(0, index)
        .map(
          (previous, previousIndex) =>
            `${quoteIdentifier(previous)} = $${placeholderStart + previousIndex}`,
        )
      return `(${[...equality, `${quoteIdentifier(column)} > $${placeholderStart + index}`].join(' AND ')})`
    })
    .join(' OR ')
}

const paginarTabla = async function* (
  client: pg.PoolClient,
  source: SourceTable,
  batchSize = 250,
): AsyncGenerator<{ key: unknown[]; data: Record<string, unknown> }> {
  let cursor: unknown[] | null = null
  const relation = `${quoteIdentifier(source.schema)}.${quoteIdentifier(source.table)}`
  const keyColumns = source.primaryKey.length ? source.primaryKey : ['ctid']
  const selection = source.primaryKey.length ? '*' : '*, ctid::text AS "__migration_ctid"'
  const order = keyColumns.map(quoteIdentifier).join(', ')
  while (true) {
    const values: unknown[] = cursor ?? []
    const where: string = cursor ? `WHERE ${cursorPredicate(keyColumns, values)}` : ''
    const page: pg.QueryResult<Record<string, unknown>> = await client.query<
      Record<string, unknown>
    >(`SELECT ${selection} FROM ${relation} ${where} ORDER BY ${order} LIMIT ${batchSize}`, values)
    if (!page.rows.length) return
    const last: Record<string, unknown> = page.rows[page.rows.length - 1]!
    const nextCursor = source.primaryKey.length
      ? source.primaryKey.map(column => last[column])
      : [last.__migration_ctid]
    for (const data of page.rows) {
      const key = source.primaryKey.length
        ? source.primaryKey.map(column => data[column])
        : [data.__migration_ctid]
      if (!source.primaryKey.length) delete data.__migration_ctid
      yield { key, data }
    }
    cursor = nextCursor
  }
}

const exportar = async (directory: string): Promise<void> => {
  const connectionString = process.env.AURORA_EXPORT_URL
  if (!connectionString)
    throw new Error('Configura AURORA_EXPORT_URL; nunca se guarda en el manifiesto.')
  const pool = new pg.Pool({ connectionString, max: 1, application_name: 'edtech-lowcost-export' })
  const client = await pool.connect()
  try {
    await mkdir(directory, { recursive: true })
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const tables = await obtenerTablas(client)
    const snapshotTables: SnapshotTable[] = []
    for (const source of tables) {
      const filename = `${source.schema}--${source.table}.jsonl.gz`
      const output = createWriteStream(join(directory, filename), { flags: 'wx' })
      const gzip = createGzip({ level: 6 })
      gzip.pipe(output)
      const fingerprints: string[] = []
      let count = 0
      const duplicateCounts = new Map<string, number>()
      for await (const row of paginarTabla(client, source)) {
        const fingerprint = fingerprintRow(row.data)
        const duplicate = duplicateCounts.get(fingerprint) ?? 0
        duplicateCounts.set(fingerprint, duplicate + 1)
        const record: SnapshotRow = {
          ...source,
          key: jsonSafe(row.key) as unknown[],
          data: jsonSafe(row.data) as Record<string, unknown>,
          fingerprint,
          duplicate,
        }
        await writeWithBackpressure(gzip, `${JSON.stringify(record)}\n`)
        fingerprints.push(fingerprint)
        count += 1
      }
      const finished = Promise.all([once(gzip, 'end'), once(output, 'finish')])
      gzip.end()
      await finished
      fingerprints.sort()
      snapshotTables.push({
        ...source,
        count,
        fingerprintDigest: createHash('sha256').update(fingerprints.join('\n')).digest('hex'),
      })
    }
    const manifest: SnapshotManifest = {
      version: 1,
      snapshotId: randomUUID(),
      createdAt: new Date().toISOString(),
      tables: snapshotTables,
    }
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), {
      flag: 'wx',
    })
    await client.query('COMMIT')
    process.stdout.write(
      `Exportación lista: ${snapshotTables.length} tablas, ${snapshotTables.reduce((sum, table) => sum + table.count, 0)} filas.\n`,
    )
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

const manifestAt = async (directory: string): Promise<SnapshotManifest> => {
  const manifest = JSON.parse(
    await readFile(join(directory, 'manifest.json'), 'utf8'),
  ) as SnapshotManifest
  if (manifest.version !== 1 || !Array.isArray(manifest.tables))
    throw new Error('Manifiesto de migración inválido.')
  return manifest
}

const domainFor = (schema: SourceSchema): string => DOMAINS[schema]
const tableFor = (schema: SourceSchema): string => {
  const envName = `EDTECH_TABLE_${domainFor(schema).replaceAll('-', '_').toUpperCase()}`
  const name = process.env[envName]
  if (!name) throw new Error(`Falta ${envName}; configura el nombre de tabla antes de importar.`)
  return name
}

const makeDdbItem = (row: SnapshotRow) => ({
  PK: stableLegacyRecordKey(row),
  SK: 'SNAPSHOT#RECORD',
  GSI1PK: `LEGACY#${row.schema}.${row.table}`,
  GSI1SK: `${row.fingerprint}#${String(row.duplicate).padStart(8, '0')}`,
  GSI2PK: `LEGACY#${row.schema}`,
  GSI2SK: `${row.table}#${row.fingerprint}#${String(row.duplicate).padStart(8, '0')}`,
  entity: 'LegacySnapshotRecord',
  sourceSchema: row.schema,
  sourceTable: row.table,
  sourceKey: row.key,
  fingerprint: row.fingerprint,
  data: row.data,
})

const retriesUnprocessed = async (
  client: DynamoDBDocumentClient,
  table: string,
  requests: Array<{ PutRequest: { Item: Record<string, unknown> } }>,
): Promise<void> => {
  let pending = requests
  for (let attempt = 0; pending.length && attempt < 6; attempt += 1) {
    const result = await client.send(new BatchWriteCommand({ RequestItems: { [table]: pending } }))
    pending = (result.UnprocessedItems?.[table] ?? []) as typeof requests
    if (pending.length)
      await new Promise(resolve => setTimeout(resolve, Math.min(100 * 2 ** attempt, 3000)))
  }
  if (pending.length)
    throw new Error(`DynamoDB dejó ${pending.length} escrituras sin confirmar en ${table}.`)
}

const cargarLineas = async function* (filepath: string): AsyncGenerator<SnapshotRow> {
  const lines = createInterface({
    input: createReadStream(filepath).pipe(createGunzip()),
    crlfDelay: Infinity,
  })
  for await (const line of lines) if (line) yield JSON.parse(line) as SnapshotRow
}

const importar = async (directory: string): Promise<void> => {
  const manifest = await manifestAt(directory)
  const region = process.env.AWS_REGION ?? 'us-east-1'
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: { removeUndefinedValues: true },
  })
  const s3 = new S3Client({ region })
  const payloadBucket = process.env.EDTECH_MIGRATION_BUCKET
  let written = 0
  for (const source of manifest.tables) {
    const targetTable = tableFor(source.schema)
    const filepath = join(directory, `${source.schema}--${source.table}.jsonl.gz`)
    let batch: Array<{ PutRequest: { Item: Record<string, unknown> } }> = []
    for await (const row of cargarLineas(filepath)) {
      const item = makeDdbItem(row) as Record<string, unknown>
      if (Buffer.byteLength(JSON.stringify(item), 'utf8') > 320 * 1024) {
        if (!payloadBucket)
          throw new Error(
            'Un registro supera 320 KB; configura EDTECH_MIGRATION_BUCKET para guardar el payload en S3.',
          )
        const key = `migration/${domainFor(row.schema)}/${createHash('sha256').update(stableLegacyRecordKey(row)).digest('hex')}.json.gz`
        const body = gzipSync(Buffer.from(canonical(jsonSafe(row.data))))
        await s3.send(
          new PutObjectCommand({
            Bucket: payloadBucket,
            Key: key,
            Body: body,
            ContentType: 'application/json',
            ContentEncoding: 'gzip',
          }),
        )
        delete item.data
        item.dataObjectKey = key
      }
      batch.push({ PutRequest: { Item: item } })
      if (batch.length === 25) {
        await retriesUnprocessed(ddb, targetTable, batch)
        written += batch.length
        batch = []
      }
    }
    if (batch.length) {
      await retriesUnprocessed(ddb, targetTable, batch)
      written += batch.length
    }
  }
  process.stdout.write(
    `Importación repetible terminada: ${written} filas escritas; no se publicaron eventos ni se borraron registros.\n`,
  )
}

const verify = async (directory: string): Promise<void> => {
  const manifest = await manifestAt(directory)
  const ddb = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' }),
  )
  const mismatches: string[] = []
  for (const source of manifest.tables) {
    const targetTable = tableFor(source.schema)
    const fingerprints: string[] = []
    let cursor: Record<string, unknown> | undefined
    do {
      const result = await ddb.send(
        new QueryCommand({
          TableName: targetTable,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :table',
          ExpressionAttributeValues: { ':table': `LEGACY#${source.schema}.${source.table}` },
          ProjectionExpression: 'fingerprint',
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      )
      for (const item of result.Items ?? [])
        if (typeof item.fingerprint === 'string') fingerprints.push(item.fingerprint)
      cursor = result.LastEvaluatedKey as Record<string, unknown> | undefined
    } while (cursor)
    fingerprints.sort()
    const digest = createHash('sha256').update(fingerprints.join('\n')).digest('hex')
    const equal = fingerprints.length === source.count && digest === source.fingerprintDigest
    if (!equal)
      mismatches.push(
        `${source.schema}.${source.table}: export=${source.count}; DynamoDB=${fingerprints.length}`,
      )
  }
  if (mismatches.length) throw new Error(`La reconciliación no coincide:\n${mismatches.join('\n')}`)
  process.stdout.write(
    `Reconciliación correcta: ${manifest.tables.length} tablas verificadas; ${manifest.tables.reduce((sum, table) => sum + table.count, 0)} filas.\n`,
  )
}

const [mode, directory] = process.argv.slice(2)
if (import.meta.main) {
  if (!mode || !directory || !['export', 'import', 'verify'].includes(mode)) {
    process.stderr.write(
      'Uso: bun run tools/migration/aurora-dynamodb.ts <export|import|verify> <directorio-snapshot>\n',
    )
    process.exitCode = 2
  } else {
    const operation =
      mode === 'export'
        ? exportar(directory)
        : mode === 'import'
          ? importar(directory)
          : verify(directory)
    operation.catch(error => {
      process.stderr.write(`${error instanceof Error ? error.message : 'Error de migración'}\n`)
      process.exitCode = 1
    })
  }
}
