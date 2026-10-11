import express from 'express'
import pg from 'pg'
import { Signer } from '@aws-sdk/rds-signer'
import { readFile } from 'node:fs/promises'
import {
  crearSqsClient,
  SqsPoller,
  errorMiddleware,
  noEncontradoMiddleware,
  requestContextMiddleware,
} from '@edtech/shared-kernel'
import type { Config } from './config/config'
import { TerminalHandler } from '../application/terminal/terminal.handler'
import { RepositorioTerminales } from './out/persistencia/repositorio.drizzle'
import { LocalIoTGateway } from './out/mqtt.gateway'
import { AwsIoTGateway } from './out/aws-iot.gateway'
import { crearRouter } from './in/http/routes'
import { crearProcesador } from './in/messaging/consumer'
export const construirApp = async (cfg: Config, migracion: string) => {
  if (!cfg.dbUrl && !cfg.dbHost) throw new Error('Falta DATABASE_URL o DB_HOST para iot-terminals')
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
  await pool.query('INSERT INTO iot_terminals.terminals(id) VALUES ($1) ON CONFLICT DO NOTHING', [
    cfg.deviceId,
  ])
  const repo = new RepositorioTerminales(pool, cfg.deviceId, cfg.offlineMs)
  const handler = new TerminalHandler(repo)
  const gateway = cfg.iotEndpoint ? new AwsIoTGateway(cfg, repo) : new LocalIoTGateway(cfg, repo)
  const sqs = crearSqsClient({
    region: cfg.region,
    ...(cfg.awsEndpoint ? { endpoint: cfg.awsEndpoint } : {}),
  })
  const procesar = crearProcesador(repo, cfg.deviceId)
  const pollers = [cfg.cola, cfg.colaTelemetry]
    .filter((q): q is string => Boolean(q))
    .map(queueUrl => new SqsPoller(sqs, { queueUrl, procesar }))
  const http = express()
  http.use(requestContextMiddleware)
  http.get('/health', (_req, res) =>
    res.json({ ok: true, servicio: 'iot-terminals', mqtt: gateway.connected }),
  )
  http.get('/ready', (_req, res) => {
    void pool
      .query('SELECT 1')
      .then(() => res.json({ listo: true }))
      .catch(() => res.status(503).json({ listo: false }))
  })
  http.use('/api/iot', crearRouter(handler, cfg))
  http.use(noEncontradoMiddleware)
  http.use(errorMiddleware)
  return {
    http,
    pollers,
    gateway,
    cerrar: async () => {
      pollers.forEach(p => p.detener())
      await gateway.cerrar()
      await pool.end()
    },
  }
}
