import {
  DynamoRepository,
  crearDynamoDocumentClient,
  type DomainEvent,
  type UniqueId,
} from '@edtech/shared-kernel'
import { UniqueId as Id } from '@edtech/shared-kernel'
import {
  GetCommand,
  type DynamoDBDocumentClient,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb'
import {
  MazoFlashcards,
  type LeccionFuente,
  type Tarjeta,
} from '../../../domain/entities/mazo-flashcards.entity'
import type { MazoRepository } from '../../../domain/ports-out/mazo.repository'

type MazoItem = {
  PK: string
  SK: 'AGGREGATE'
  entity: 'MazoFlashcards'
  id: string
  tomoId: string
  cursoId: string
  version: number
  persistenceVersion: number
  contenidoHash: string
  estado: string
  modeloUsado: string | null
  generadoAt: string | null
  publicadoAt: string | null
  intentos: number
  leccionesFuente: LeccionFuente[]
  tarjetas: Array<Omit<Tarjeta, 'revisadaAt'> & { revisadaAt: string | null }>
  GSI1PK: string
  GSI1SK: string
  GSI2PK: string
  GSI2SK: string
  createdAt: string
  updatedAt: string
}

const padded = (version: number): string => String(version).padStart(10, '0')
const aFecha = (value: string | null): Date | null => (value ? new Date(value) : null)
const mapear = (item: MazoItem): MazoFlashcards =>
  MazoFlashcards.reconstruir({
    id: Id.desde(item.id),
    tomoId: item.tomoId,
    cursoId: item.cursoId,
    version: item.version,
    contenidoHash: item.contenidoHash,
    estado: item.estado as 'GENERANDO' | 'EN_REVISION' | 'PUBLICADO' | 'FALLIDO',
    modeloUsado: item.modeloUsado,
    generadoAt: aFecha(item.generadoAt),
    publicadoAt: aFecha(item.publicadoAt),
    intentos: item.intentos,
    leccionesFuente: item.leccionesFuente,
    tarjetas: item.tarjetas.map(t => ({ ...t, revisadaAt: aFecha(t.revisadaAt) })),
  })

/** Guarda el agregado completo como un item: no hace lecturas N+1 y conserva
 * el filtro de publicación en el repositorio. El límite DynamoDB de 400 KB
 * se valida antes de escribir; el contenido fuente sigue viviendo en S3.
 */
export class DynamoMazoRepository implements MazoRepository {
  private readonly repository: DynamoRepository
  private readonly client: DynamoDBDocumentClient

  constructor(tableName: string, options: { region?: string; endpoint?: string } = {}) {
    this.client = crearDynamoDocumentClient(options)
    this.repository = new DynamoRepository(this.client, tableName)
  }

  async porId(id: UniqueId): Promise<MazoFlashcards | null> {
    const item = await this.repository.get<MazoItem>(
      { PK: `MAZO#${id.valor}`, SK: 'AGGREGATE' },
      true,
    )
    return item ? mapear(item) : null
  }

  async porTomoYHash(tomoId: string, contenidoHash: string): Promise<MazoFlashcards | null> {
    const lookup = await this.repository.get<{ PK: string; SK: string; mazoId: string }>(
      { PK: `TOMO#${tomoId}`, SK: `HASH#${contenidoHash}` },
      true,
    )
    return lookup ? this.porId(Id.desde(lookup.mazoId)) : null
  }

  async ultimaVersionDe(tomoId: string): Promise<number> {
    const page = await this.repository.query<MazoItem>({
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: { ':pk': `TOMO#${tomoId}` },
      indexName: 'GSI1',
      limit: 1,
      scanIndexForward: false,
    })
    return Number(page.items[0]?.version ?? 0)
  }

  async porTomoParaAdmin(tomoId: string): Promise<MazoFlashcards[]> {
    const result: MazoFlashcards[] = []
    let cursor: string | undefined
    do {
      const page = await this.repository.query<MazoItem>({
        keyConditionExpression: 'GSI1PK = :pk',
        expressionAttributeValues: { ':pk': `TOMO#${tomoId}` },
        indexName: 'GSI1',
        limit: 100,
        scanIndexForward: false,
        ...(cursor ? { cursor } : {}),
      })
      result.push(...page.items.map(mapear))
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    return result
  }

  async porTomoParaEstudiante(tomoId: string): Promise<Tarjeta[]> {
    const mazos = await this.porTomoParaAdmin(tomoId)
    return mazos
      .filter(mazo => mazo.estado === 'PUBLICADO')
      .sort((a, b) => b.version - a.version)
      .flatMap(mazo => mazo.tarjetas.filter(tarjeta => tarjeta.estado === 'PUBLICADA'))
  }

  async guardar(mazo: MazoFlashcards, eventos: DomainEvent[] = []): Promise<void> {
    const key = { PK: `MAZO#${mazo.id.valor}`, SK: 'AGGREGATE' as const }
    const actual = await this.client.send(
      new GetCommand({
        TableName: this.repository.tableName,
        Key: key,
        ConsistentRead: true,
      }),
    )
    const prev = actual.Item as MazoItem | undefined
    const now = new Date().toISOString()
    const item: MazoItem = {
      ...key,
      entity: 'MazoFlashcards',
      id: mazo.id.valor,
      tomoId: mazo.tomoId,
      cursoId: mazo.cursoId,
      version: mazo.version,
      persistenceVersion: (prev?.persistenceVersion ?? 0) + 1,
      contenidoHash: mazo.contenidoHash,
      estado: mazo.estado,
      modeloUsado: mazo.modeloUsado,
      generadoAt: mazo.generadoAt?.toISOString() ?? null,
      publicadoAt: mazo.publicadoAt?.toISOString() ?? null,
      intentos: mazo.intentos,
      leccionesFuente: [...mazo.leccionesFuente],
      tarjetas: mazo.tarjetas.map(t => ({ ...t, revisadaAt: t.revisadaAt?.toISOString() ?? null })),
      GSI1PK: `TOMO#${mazo.tomoId}`,
      GSI1SK: `VERSION#${padded(mazo.version)}#${mazo.id.valor}`,
      GSI2PK: `TOMO#${mazo.tomoId}#HASH#${mazo.contenidoHash}`,
      GSI2SK: `VERSION#${padded(mazo.version)}#${mazo.id.valor}`,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    }
    const condition = prev
      ? {
          ConditionExpression: 'persistenceVersion = :expected',
          ExpressionAttributeValues: { ':expected': prev.persistenceVersion },
        }
      : { ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)' }
    const operations: NonNullable<TransactWriteCommandInput['TransactItems']> = [
      {
        Put: {
          TableName: this.repository.tableName,
          Item: item,
          ...condition,
        },
      },
    ]
    if (!prev) {
      // Los lookups se crean en la misma transacción que el agregado. Así dos
      // solicitudes concurrentes no generan duplicados por hash ni versión.
      operations.push(
        {
          Put: {
            TableName: this.repository.tableName,
            Item: {
              PK: `TOMO#${mazo.tomoId}`,
              SK: `HASH#${mazo.contenidoHash}`,
              entity: 'MazoHashLookup',
              mazoId: mazo.id.valor,
            },
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
          },
        },
        {
          Put: {
            TableName: this.repository.tableName,
            Item: {
              PK: `TOMO#${mazo.tomoId}`,
              SK: `VERSION#${padded(mazo.version)}`,
              entity: 'MazoVersionLookup',
              mazoId: mazo.id.valor,
            },
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
          },
        },
      )
    }
    await this.repository.transactWithOutbox(operations, eventos)
  }
}
