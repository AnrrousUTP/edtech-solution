import pg from 'pg'
import { readFile, readdir } from 'node:fs/promises'
import { Signer } from '@aws-sdk/rds-signer'
import { crearSecretsClient, leerSecreto } from '@edtech/shared-kernel'
import type { Config } from '../../config/config'

export type Db = {
  // eslint-disable-next-line -- pg devuelve filas dinámicas en este adaptador
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }>
  execute: (sql: string) => Promise<unknown>
  claimEvent: (eventId: string, eventType: string) => Promise<boolean>
  releaseEvent: (eventId: string) => Promise<void>
  transaction: <T>(work: (db: Db) => Promise<T>) => Promise<T>
}
export const crearPool = async (cfg: Config): Promise<pg.Pool> => {
  if (cfg.db.url) return new pg.Pool({ connectionString: cfg.db.url, max: 5 })
  if (!cfg.db.secretName) throw new Error('Falta DATABASE_URL o DB_SECRET_NAME para payments')
  const db = await leerSecreto(
    crearSecretsClient({
      region: cfg.region,
      ...(cfg.awsEndpoint ? { endpoint: cfg.awsEndpoint } : {}),
    }),
    cfg.db.secretName,
  )
  if (db.auth !== 'iam' || !db.host || !db.username)
    throw new Error('El secreto de conexión payments no tiene configuración de IAM DB auth')
  const signer = new Signer({
    hostname: db.host,
    port: Number(db.port ?? 5432),
    username: db.username,
    region: cfg.region,
  })
  return new pg.Pool({
    host: db.host,
    port: Number(db.port ?? 5432),
    database: db.dbname ?? 'edtech',
    user: db.username,
    password: () => signer.getAuthToken(),
    ssl: { rejectUnauthorized: true },
    max: 5,
  })
}
export const crearDb = (pool: pg.Pool): Db => ({
  query: (sql, values) => pool.query(sql, values),
  execute: sql => pool.query(sql),
  claimEvent: async (eventId, eventType) => {
    const r = await pool.query(
      `INSERT INTO payments.processed_events (event_id,event_type,resultado) VALUES ($1,$2,'OK') ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [eventId, eventType],
    )
    return r.rows.length > 0
  },
  releaseEvent: async eventId => {
    await pool.query('DELETE FROM payments.processed_events WHERE event_id = $1', [eventId])
  },
  transaction: async work => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const scoped = {
        ...crearDb(pool),
        query: (sql: string, values?: unknown[]) => client.query(sql, values),
      }
      const result = await work(scoped)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },
})
export const aplicarMigraciones = async (db: Db, carpeta: string): Promise<void> => {
  for (const archivo of (await readdir(carpeta)).filter(f => f.endsWith('.sql')).sort()) {
    const sql = await readFile(`${carpeta}/${archivo}`, 'utf8')
    for (const sentencia of sql
      .split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(Boolean)) {
      try {
        await db.query(sentencia)
      } catch (error) {
        const code = (error as { code?: string }).code
        if (!['42710', '42P07', '42701'].includes(code ?? '')) throw error
      }
    }
  }
}
