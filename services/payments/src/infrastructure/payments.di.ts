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
import { CapturarPagoHandler } from '../application/capturar-pago/capturar-pago.handler'
import { CrearCompraDirectaHandler } from '../application/crear-compra-directa/crear-compra-directa.handler'
import { CrearOrdenHandler } from '../application/crear-orden/crear-orden.handler'
import { ProcesarWebhookHandler } from '../application/procesar-webhook/procesar-webhook.handler'
import type { Config } from './config/config'
import { crearRouter } from './in/http/routes'
import { crearProcesador } from './in/messaging/sqs.consumer'
import { crearProcesadorWebhooks } from './in/messaging/sqs-webhook.consumer'
import { crearRutaWebhook } from './in/http/webhook.route'
import { crearPublisher } from './out/eventbridge-event.publisher'
import { VerificadorEd25519 } from './out/atribucion.verifier'
import { PaypalGateway, credencialesPaypalDesdeSecreto } from './out/paypal/paypal.gateway'
import { PaypalLocalGateway } from './out/paypal/paypal-local.gateway'
import {
  DrizzleOrdenRepository,
  DrizzlePrecioProyeccionRepository,
  DrizzleWebhookRepository,
  SqsColaWebhooks,
} from './out/persistencia/repositorios.drizzle'
import { aplicarMigraciones, crearDb, crearPool, type Db } from './out/persistencia/db'

export type App = {
  http: Express
  poller: SqsPoller | null
  pollerWebhooks: SqsPoller | null
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
  const secrets = crearSecretsClient({ region: cfg.region, endpoint: cfg.awsEndpoint })
  const ordenes = new DrizzleOrdenRepository(db)
  const precios = new DrizzlePrecioProyeccionRepository(db)
  const webhooks = new DrizzleWebhookRepository(db)
  const reloj = new RelojSistema()
  const verification = cfg.referralVerificationSecretName
    ? await leerSecreto(secrets, cfg.referralVerificationSecretName)
    : null
  const verifier = verification?.publicKey
    ? new VerificadorEd25519(verification.publicKey)
    : undefined
  if (cfg.referralVerificationSecretName && !verifier)
    throw new Error('Falta la clave pública de atribución')
  if (!cfg.paypalLocalMode && !cfg.queueWebhooksUrl?.trim())
    throw new Error('Falta QUEUE_WEBHOOKS_URL para recibir webhooks de PayPal')
  const paypal = cfg.paypalLocalMode
    ? new PaypalLocalGateway()
    : new PaypalGateway(
        credencialesPaypalDesdeSecreto(
          await leerSecreto(secrets, cfg.paypalSecretName ?? 'edtech/dev/paypal'),
        ),
      )
  const colaWebhooks = cfg.paypalLocalMode
    ? null
    : new SqsColaWebhooks(sqs, cfg.queueWebhooksUrl ?? '')
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
  bus.register(new CrearOrdenHandler(ordenes, precios, paypal, publisher, reloj, verifier))
  bus.register(new CapturarPagoHandler(ordenes, paypal, publisher, reloj))
  bus.register(new ProcesarWebhookHandler(ordenes, webhooks, publisher, reloj, () => bus))
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
    res.json({ ok: true, servicio: 'payments', pasarela: cfg.paypalLocalMode ? 'local' : 'paypal' })
  })
  http.get('/ready', async (_req, res) => {
    const listo = await db.execute('select 1').then(
      () => true,
      () => false,
    )
    res.status(listo ? 200 : 503).json({ listo })
  })

  if (colaWebhooks) http.use('/api/payments', crearRutaWebhook(paypal, webhooks, colaWebhooks))
  http.use('/api/payments', crearRouter(bus, queries, cfg))
  http.use(noEncontradoMiddleware)
  http.use(errorMiddleware)

  const procesar = crearProcesador(bus)
  const poller = cfg.colaUrl ? new SqsPoller(sqs, { queueUrl: cfg.colaUrl, procesar }) : null
  const pollerWebhooks = colaWebhooks
    ? new SqsPoller(sqs, {
        queueUrl: cfg.queueWebhooksUrl ?? '',
        procesar: crearProcesadorWebhooks(bus, webhooks),
      })
    : null

  return {
    http,
    poller,
    pollerWebhooks,
    db,
    outbox,
    expirarOrdenes: async () => {
      const r = await bus.dispatch<{ expiradas: number }, Error>({ _tag: 'ExpirarOrdenes' })
      if (r.ok && r.value.expiradas > 0) log.info('órdenes expiradas', r.value)
    },
    cerrar: async () => {
      poller?.detener()
      pollerWebhooks?.detener()
      await pool.end()
    },
  }
}
