// Composition root: el ÚNICO archivo que instancia implementaciones concretas.
import {
  CommandBus,
  QueryBus,
  RelojSistema,
  SqsPoller,
  crearSecretsClient,
  crearSqsClient,
  errorMiddleware,
  leerSecreto,
  log,
  noEncontradoMiddleware,
  OutboxWorker,
  type OutboxRow,
  requestContextMiddleware,
  xrayMiddleware,
} from '@edtech/shared-kernel'
import express, { type Express } from 'express'
import {
  DespublicarPrecioHandler,
  EstadoOrdenHandler,
  ExpirarOrdenesHandler,
  MisOrdenesHandler,
  ProyectarPrecioHandler,
  TodasLasOrdenesHandler,
} from '../application/consultar-ordenes/consultar-ordenes.handler'
import { CrearCompraDirectaHandler } from '../application/crear-compra-directa/crear-compra-directa.handler'
import type { Config } from './config/config'
import { crearRouter } from './in/http/routes'
import { crearProcesador } from './in/messaging/sqs.consumer'
import { crearPublisher } from './out/eventbridge-event.publisher'
import { VerificadorEd25519 } from './out/atribucion.verifier'
import {
  DrizzleOrdenRepository,
  DrizzlePrecioProyeccionRepository,
} from './out/persistencia/repositorios.drizzle'
import { aplicarMigraciones, crearDb, crearPool, type Db } from './out/persistencia/db'

export type App = {
  http: Express
  poller: SqsPoller | null
  db: Db
  expirarOrdenes: () => Promise<void>
  outbox: OutboxWorker
  cerrar: () => Promise<void>
}

export const construirApp = async (cfg: Config, carpetaMigraciones: string): Promise<App> => {
  const pool = await crearPool(cfg)
  const db = crearDb(pool)
  await aplicarMigraciones(db, carpetaMigraciones)

  const publisher = crearPublisher(cfg)
  const sqs = crearSqsClient({ region: cfg.region, endpoint: cfg.awsEndpoint })
  const ordenes = new DrizzleOrdenRepository(db)
  const precios = new DrizzlePrecioProyeccionRepository(db)
  const reloj = new RelojSistema()
  const verification = cfg.referralVerificationSecretName
    ? await leerSecreto(
        crearSecretsClient({ region: cfg.region, endpoint: cfg.awsEndpoint }),
        cfg.referralVerificationSecretName,
      )
    : null
  const verifier = verification?.publicKey
    ? new VerificadorEd25519(verification.publicKey)
    : undefined
  if (cfg.referralVerificationSecretName && !verifier)
    throw new Error('Falta la clave pública de atribución')
  const outbox = new OutboxWorker(
    {
      pendientes: async () =>
        (
          await pool.query<OutboxRow>(
            'SELECT * FROM payments.outbox WHERE publicado_at IS NULL ORDER BY creado_at LIMIT 50',
          )
        ).rows,
      publicado: async id => {
        await pool.query('UPDATE payments.outbox SET publicado_at=now() WHERE event_id=$1', [id])
      },
    },
    publisher,
  )

  const bus = new CommandBus()
  bus.register(new CrearCompraDirectaHandler(ordenes, precios, publisher, reloj, verifier))
  bus.register(new ProyectarPrecioHandler(precios))
  bus.register(new DespublicarPrecioHandler(precios))
  bus.register(new ExpirarOrdenesHandler(ordenes, () => reloj.ahora()))

  const queries = new QueryBus()
  queries.register(new EstadoOrdenHandler(ordenes))
  queries.register(new MisOrdenesHandler(ordenes))
  queries.register(new TodasLasOrdenesHandler(ordenes))

  const http = express()
  http.use(requestContextMiddleware)
  http.use(xrayMiddleware('payments'))
  http.get('/health', (_req, res) => {
    res.json({ ok: true, servicio: 'payments', compras: 'directas' })
  })
  http.get('/ready', async (_req, res) => {
    const listo = await db.execute('select 1').then(
      () => true,
      () => false,
    )
    res.status(listo ? 200 : 503).json({ listo })
  })

  http.use('/api/payments', crearRouter(bus, queries, cfg))
  http.use(noEncontradoMiddleware)
  http.use(errorMiddleware)

  const procesar = crearProcesador(bus)
  const poller = cfg.colaUrl ? new SqsPoller(sqs, { queueUrl: cfg.colaUrl, procesar }) : null

  return {
    http,
    poller,
    db,
    outbox,
    expirarOrdenes: async () => {
      const r = await bus.dispatch<{ expiradas: number }, Error>({ _tag: 'ExpirarOrdenes' })
      if (r.ok && r.value.expiradas > 0) log.info('órdenes expiradas', r.value)
    },
    cerrar: async () => {
      poller?.detener()
      await pool.end()
    },
  }
}
