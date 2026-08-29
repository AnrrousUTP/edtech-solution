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
  requestContextMiddleware,
} from '@edtech/shared-kernel'
import express, { type Express } from 'express'
import { CapturarPagoHandler } from '../application/capturar-pago/capturar-pago.handler'
import {
  DespublicarPrecioHandler,
  EstadoOrdenHandler,
  ExpirarOrdenesHandler,
  MisOrdenesHandler,
  ProyectarPrecioHandler,
} from '../application/consultar-ordenes/consultar-ordenes.handler'
import { CrearOrdenHandler } from '../application/crear-orden/crear-orden.handler'
import { ProcesarWebhookHandler } from '../application/procesar-webhook/procesar-webhook.handler'
import type { Config } from './config/config'
import { crearRouter } from './in/http/routes'
import { crearRutaWebhook } from './in/http/webhook.route'
import { crearProcesador } from './in/messaging/sqs.consumer'
import { crearPublisher } from './out/eventbridge-event.publisher'
import { PaypalGateway, type CredencialesPaypal } from './out/paypal/paypal.gateway'
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
  workerWebhooks: SqsPoller | null
  db: Db
  expirarOrdenes: () => Promise<void>
  cerrar: () => Promise<void>
}

export const construirApp = async (cfg: Config, carpetaMigraciones: string): Promise<App> => {
  const pool = await crearPool(cfg)
  const db = crearDb(pool)
  await aplicarMigraciones(db, carpetaMigraciones)

  // Las credenciales SIEMPRE de Secrets Manager (D17): nunca en el repo ni en
  // variables de entorno de la task definition con el valor en claro.
  const secretos = crearSecretsClient({ region: cfg.region, endpoint: cfg.awsEndpoint })
  const bruto = await leerSecreto(secretos, cfg.paypalSecretName)
  const credenciales: CredencialesPaypal = {
    env: bruto.env === 'live' ? 'live' : 'sandbox',
    clientId: bruto.clientId ?? '',
    clientSecret: bruto.clientSecret ?? '',
    webhookId: bruto.webhookId ?? '',
    moneda: bruto.moneda ?? 'USD',
  }
  if (!credenciales.webhookId) {
    log.warn('sin webhookId en el secreto: la verificación de firma rechazará todo webhook')
  }

  const publisher = crearPublisher(cfg)
  const sqs = crearSqsClient({ region: cfg.region, endpoint: cfg.awsEndpoint })
  const pasarela = new PaypalGateway(credenciales)

  const ordenes = new DrizzleOrdenRepository(db)
  const precios = new DrizzlePrecioProyeccionRepository(db)
  const webhooks = new DrizzleWebhookRepository(db)
  const colaWebhooks = new SqsColaWebhooks(sqs, cfg.colaWebhooksUrl ?? '')
  const reloj = new RelojSistema()

  const bus = new CommandBus()
  bus.register(new CrearOrdenHandler(ordenes, precios, pasarela, publisher, reloj))
  bus.register(new CapturarPagoHandler(ordenes, pasarela, publisher, reloj))
  bus.register(new ProcesarWebhookHandler(ordenes, webhooks, publisher, reloj, () => bus))
  bus.register(new ProyectarPrecioHandler(precios))
  bus.register(new DespublicarPrecioHandler(precios))
  bus.register(new ExpirarOrdenesHandler(ordenes, () => reloj.ahora()))

  const queries = new QueryBus()
  queries.register(new EstadoOrdenHandler(ordenes))
  queries.register(new MisOrdenesHandler(ordenes))

  const http = express()
  http.use(requestContextMiddleware)
  http.get('/health', (_req, res) => {
    res.json({ ok: true, servicio: 'payments', paypal: credenciales.env })
  })
  http.get('/ready', async (_req, res) => {
    const listo = await db.execute('select 1').then(
      () => true,
      () => false,
    )
    res.status(listo ? 200 : 503).json({ listo, webhookConfigurado: !!credenciales.webhookId })
  })

  // ORDEN CRÍTICO (doc 09 §3): la ruta del webhook con express.raw va ANTES
  // del router con express.json. Si se invierte, la firma no valida nunca.
  http.use('/api/payments', crearRutaWebhook(pasarela, webhooks, colaWebhooks))
  http.use('/api/payments', crearRouter(bus, queries, cfg))
  http.use(noEncontradoMiddleware)
  http.use(errorMiddleware)

  const procesar = crearProcesador(db, bus, webhooks)
  const poller = cfg.colaUrl ? new SqsPoller(sqs, { queueUrl: cfg.colaUrl, procesar }) : null
  const workerWebhooks = cfg.colaWebhooksUrl
    ? new SqsPoller(sqs, { queueUrl: cfg.colaWebhooksUrl, procesar })
    : null

  return {
    http,
    poller,
    workerWebhooks,
    db,
    expirarOrdenes: async () => {
      const r = await bus.dispatch<{ expiradas: number }, Error>({ _tag: 'ExpirarOrdenes' })
      if (r.ok && r.value.expiradas > 0) log.info('órdenes expiradas', r.value)
    },
    cerrar: async () => {
      poller?.detener()
      workerWebhooks?.detener()
      await pool.end()
    },
  }
}
