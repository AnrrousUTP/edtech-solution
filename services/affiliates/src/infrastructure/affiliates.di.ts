import express from 'express'
import pg from 'pg'
import { Signer } from '@aws-sdk/rds-signer'
import { readFile } from 'node:fs/promises'
import {
  crearSecretsClient,
  leerSecreto,
  crearSqsClient,
  SqsPoller,
  crearEventBridgeClient,
  EventBridgePublisher,
  OutboxWorker,
  type OutboxRow,
  errorMiddleware,
  noEncontradoMiddleware,
  requestContextMiddleware,
} from '@edtech/shared-kernel'
import { AfiliacionHandler } from '../application/afiliacion/afiliacion.handler'
import type { Config } from './config/config'
import { RepositorioAfiliados } from './out/persistencia/repositorio.drizzle'
import { FirmadorEd25519 } from './out/firmador'
import { crearRouter } from './in/http/routes'
import { crearProcesador } from './in/messaging/consumer'
export const construirApp = async (cfg: Config, migracion: string) => {
  if (!cfg.dbUrl && !cfg.dbHost) throw new Error('Falta DATABASE_URL o DB_HOST para affiliates')
  const signer = cfg.dbHost
    ? new Signer({ hostname: cfg.dbHost, port: 5432, username: cfg.dbUser, region: cfg.region })
    : null
  const pool = new pg.Pool(
    cfg.dbUrl
      ? { connectionString: cfg.dbUrl, max: 5 }
      : {
          host: cfg.dbHost,
          port: 5432,
          database: 'edtech',
          user: cfg.dbUser,
          password: () => signer!.getAuthToken(),
          ssl: { rejectUnauthorized: true },
          max: 5,
        },
  )
  await pool.query(await readFile(migracion, 'utf8'))
  const secreto = await leerSecreto(
    crearSecretsClient({ region: cfg.region, endpoint: cfg.awsEndpoint }),
    cfg.secretoFirma,
  )
  if (!secreto.privateKey)
    throw new Error('Falta la clave de firma de atribución en Secrets Manager')
  const repo = new RepositorioAfiliados(pool)
  const handler = new AfiliacionHandler(repo, new FirmadorEd25519(secreto.privateKey))
  const publisher = new EventBridgePublisher(
    crearEventBridgeClient({ region: cfg.region, endpoint: cfg.awsEndpoint }),
    cfg.bus,
  )
  const outbox = new OutboxWorker(
    {
      pendientes: async () =>
        (
          await pool.query<OutboxRow>(
            'SELECT * FROM affiliates.outbox WHERE publicado_at IS NULL ORDER BY creado_at LIMIT 50',
          )
        ).rows,
      publicado: async id => {
        await pool.query('UPDATE affiliates.outbox SET publicado_at=now() WHERE event_id=$1', [id])
      },
    },
    publisher,
  )
  const http = express()
  http.use(requestContextMiddleware)
  http.get('/health', (_req, res) => res.json({ ok: true, servicio: 'affiliates' }))
  http.get('/ready', (_req, res) => {
    void pool
      .query('SELECT 1')
      .then(() => res.json({ listo: true }))
      .catch(() => res.status(503).json({ listo: false }))
  })
  http.use('/api/affiliates', crearRouter(handler, cfg))
  http.use(noEncontradoMiddleware)
  http.use(errorMiddleware)
  const poller = cfg.cola
    ? new SqsPoller(crearSqsClient({ region: cfg.region, endpoint: cfg.awsEndpoint }), {
        queueUrl: cfg.cola,
        procesar: crearProcesador(repo),
      })
    : null
  return {
    http,
    poller,
    outbox,
    cerrar: async () => {
      poller?.detener()
      await pool.end()
    },
  }
}
