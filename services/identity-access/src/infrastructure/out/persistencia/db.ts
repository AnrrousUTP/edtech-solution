import pg from 'pg'
import { readFile } from 'node:fs/promises'
import { Signer } from '@aws-sdk/rds-signer'
import type { Config } from '../../config/config'

export type Db = {
  // eslint-disable-next-line -- pg devuelve filas dinámicas en este adaptador
  query: (texto: string, valores?: unknown[]) => Promise<{ rows: Record<string, any>[] }>
  execute: (texto: string) => Promise<unknown>
  claimEvent: (eventId: string, eventType: string) => Promise<boolean>
  releaseEvent: (eventId: string) => Promise<void>
}

export const crearPool = async (cfg: Config): Promise<pg.Pool> => {
  if (cfg.db.secretName && cfg.awsEndpoint === undefined) {
    // El endpoint de Aurora se inyecta mediante DATABASE_URL en el runtime actual.
    // La firma IAM queda reservada para el adaptador de despliegue AWS.
  }
  return new pg.Pool({ connectionString: cfg.db.url, max: 5 })
}

export const crearDb = (pool: pg.Pool): Db => ({
  query: (texto, valores) => pool.query(texto, valores),
  execute: texto => pool.query(texto),
  claimEvent: async (eventId, eventType) => {
    const r = await pool.query(
      `INSERT INTO identity.processed_events (event_id,event_type,resultado) VALUES ($1,$2,'OK') ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [eventId, eventType],
    )
    return r.rows.length > 0
  },
  releaseEvent: async eventId => {
    await pool.query('DELETE FROM identity.processed_events WHERE event_id=$1', [eventId])
  },
})

export const aplicarMigraciones = async (db: Db, carpeta: string): Promise<void> => {
  const sql = await readFile(`${carpeta}/0000_init.sql`, 'utf8')
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
