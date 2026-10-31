import express from 'express'
import serverlessExpress from '@codegenie/serverless-express'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import {
  CommandBus,
  QueryBus,
  RelojSistema,
  errorMiddleware,
  noEncontradoMiddleware,
  parseSobre,
  requestContextMiddleware,
  xrayMiddleware,
  crearSecretsClient,
  leerSecreto,
  log,
} from '@edtech/shared-kernel'
import { SQSClient } from '@aws-sdk/client-sqs'
import {
  DespublicarPrecioHandler,
  EstadoOrdenHandler,
  ExpirarOrdenesHandler,
  MisOrdenesHandler,
  ProyectarPrecioHandler,
  TodasLasOrdenesHandler,
} from '../application/consultar-ordenes/consultar-ordenes.handler'
import { CrearOrdenHandler } from '../application/crear-orden/crear-orden.handler'
import { CapturarPagoHandler } from '../application/capturar-pago/capturar-pago.handler'
import { ProcesarWebhookHandler } from '../application/procesar-webhook/procesar-webhook.handler'
import { cargarConfig } from '../infrastructure/config/config'
import { crearRouter } from '../infrastructure/in/http/routes'
import { crearProcesador } from '../infrastructure/in/messaging/sqs.consumer'
import { VerificadorEd25519 } from '../infrastructure/out/atribucion.verifier'
import {
  credencialesPaypalDesdeSecreto,
  PaypalGateway,
} from '../infrastructure/out/paypal/paypal.gateway'
import { crearRutaWebhook } from '../infrastructure/in/http/webhook.route'
import { SqsColaWebhooks } from '../infrastructure/out/sqs-cola-webhooks'
import {
  DynamoPaymentsRepository,
  DynamoPrecioProyeccionRepository,
} from '../infrastructure/out/persistencia/repositorio.dynamodb'

type QueueRecord = { messageId: string; body: string }
type QueueEvent = { Records?: QueueRecord[] }
type QueueResponse = { batchItemFailures: Array<{ itemIdentifier: string }> }
type LambdaEvent = QueueEvent & { task?: string }
type ExpressLambda = (event: object, context: object) => Promise<unknown>

let runtime:
  | Promise<{
      expressHandler: ExpressLambda
      processQueue: (event: QueueEvent) => Promise<QueueResponse>
      expireOrders: () => Promise<{ expiradas: number }>
    }>
  | undefined

const runtimeReferralVerifier = async (
  cfg: ReturnType<typeof cargarConfig>,
): Promise<VerificadorEd25519 | undefined> => {
  if (!cfg.referralVerificationParameterName) return undefined
  const result = await new SSMClient({
    region: cfg.region,
    ...(cfg.awsEndpoint
      ? {
          endpoint: cfg.awsEndpoint,
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        }
      : {}),
  }).send(
    new GetParameterCommand({
      Name: cfg.referralVerificationParameterName,
      WithDecryption: false,
    }),
  )
  const pem = result.Parameter?.Value
  if (!pem) throw new Error('El parámetro público de atribución no tiene valor')
  return new VerificadorEd25519(pem)
}

const createRuntime = async () => {
  const cfg = cargarConfig()
  if (
    !cfg.dynamoTable ||
    !cfg.cognito.issuer.startsWith('https://') ||
    !cfg.cognito.clientId ||
    !cfg.cognito.jwksUri?.startsWith('https://')
  ) {
    throw new Error('Falta configurar tabla DynamoDB o Cognito para Payments Lambda')
  }
  if (!cfg.paypalSecretName || !cfg.queueWebhooksUrl) {
    throw new Error('Falta configurar el secreto PayPal o la cola de webhooks para Payments Lambda')
  }
  if (!cfg.urlBase.startsWith('https://')) {
    throw new Error('Payments Lambda requiere URL_BASE HTTPS para los retornos de PayPal')
  }

  const dynamodb = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: cfg.region,
      ...(cfg.awsEndpoint
        ? {
            endpoint: cfg.awsEndpoint,
            credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
          }
        : {}),
    }),
    { marshallOptions: { removeUndefinedValues: true } },
  )
  const orders = new DynamoPaymentsRepository(dynamodb, cfg.dynamoTable)
  const prices = new DynamoPrecioProyeccionRepository(dynamodb, cfg.dynamoTable)
  const secret = await leerSecreto(
    crearSecretsClient({ region: cfg.region, endpoint: cfg.awsEndpoint }),
    cfg.paypalSecretName,
  )
  const paypal = new PaypalGateway(credencialesPaypalDesdeSecreto(secret))
  const sqs = new SQSClient({
    region: cfg.region,
    ...(cfg.awsEndpoint
      ? {
          endpoint: cfg.awsEndpoint,
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        }
      : {}),
  })
  const webhooks = orders
  const webhookQueue = new SqsColaWebhooks(sqs, cfg.queueWebhooksUrl)
  const verifier = await runtimeReferralVerifier(cfg)
  // DynamoPaymentsRepository guarda cada DomainEvent dentro de la misma
  // transacción que su orden. La Lambda outbox publicadora de DynamoDB Streams
  // es el único puente a EventBridge: publicar aquí también duplicaría eventos.
  const publisher = { publish: async () => undefined }
  const reloj = new RelojSistema()
  const bus = new CommandBus()
  bus.register(new CrearOrdenHandler(orders, prices, paypal, publisher, reloj, verifier))
  bus.register(new CapturarPagoHandler(orders, paypal, publisher, reloj))
  bus.register(new ProcesarWebhookHandler(orders, webhooks, publisher, reloj, () => bus))
  bus.register(new ProyectarPrecioHandler(prices))
  bus.register(new DespublicarPrecioHandler(prices))
  bus.register(new ExpirarOrdenesHandler(orders, () => reloj.ahora()))

  const queries = new QueryBus()
  queries.register(new EstadoOrdenHandler(orders))
  queries.register(new MisOrdenesHandler(orders))
  queries.register(new TodasLasOrdenesHandler(orders))

  const app = express()
  app.use(requestContextMiddleware)
  app.use(xrayMiddleware('payments'))
  app.get('/health', (_req, res) => res.json({ ok: true, servicio: 'payments' }))
  app.get('/ready', async (_req, res) => {
    try {
      await prices.porCursoId('readiness-check')
      res.json({ listo: true, persistencia: 'dynamodb' })
    } catch {
      res.status(503).json({ listo: false })
    }
  })
  // El handler raw se monta antes del parser JSON del router: PayPal firma los
  // bytes originales y la comprobación falla si el cuerpo se vuelve a serializar.
  app.use('/api/payments', crearRutaWebhook(paypal, webhooks, webhookQueue))
  app.use('/api/payments', crearRouter(bus, queries, cfg))
  app.use(noEncontradoMiddleware)
  app.use(errorMiddleware)

  const processMessage = crearProcesador(bus)
  const processQueue = async (event: QueueEvent): Promise<QueueResponse> => {
    const batchItemFailures: QueueResponse['batchItemFailures'] = []
    for (const record of event.Records ?? []) {
      try {
        const raw = JSON.parse(record.body) as {
          eventType?: unknown
          aggregateId?: unknown
          payload?: { paypalEventId?: unknown }
        }
        if (raw.eventType === 'payments.webhook-recibido.interno') {
          const paypalEventId = String(raw.payload?.paypalEventId ?? raw.aggregateId ?? '')
          if (!paypalEventId) throw new Error('Mensaje webhook sin paypalEventId')
          const webhook = await webhooks.porEventId(paypalEventId)
          if (!webhook) throw new Error(`No se encontró el webhook ${paypalEventId}`)
          if (!webhook.firmaValida) {
            log.error('webhook inválido rechazado por el consumidor', { paypalEventId })
            continue
          }
          const payload = webhook.payload as { resource?: unknown }
          if (
            !payload ||
            typeof payload !== 'object' ||
            !payload.resource ||
            typeof payload.resource !== 'object'
          ) {
            await webhooks.marcarProcesado(paypalEventId, 'payload PayPal sin resource')
            continue
          }
          const resultado = await bus.dispatch({
            _tag: 'ProcesarWebhook',
            paypalEventId,
            eventType: webhook.eventType,
            recurso: payload.resource as Record<string, unknown>,
          })
          if (!resultado.ok) {
            log.error('webhook PayPal descartado por error de negocio', {
              paypalEventId,
              error:
                resultado.error instanceof Error
                  ? resultado.error.message
                  : String(resultado.error),
            })
          }
          continue
        }

        const parsed = parseSobre(record.body)
        if (!parsed.ok || (await processMessage(parsed.value)) === 'NACK') {
          batchItemFailures.push({ itemIdentifier: record.messageId })
        }
      } catch (error) {
        log.error('fallo de infraestructura procesando mensaje de pagos', {
          messageId: record.messageId,
          error: error instanceof Error ? error.message : String(error),
        })
        batchItemFailures.push({ itemIdentifier: record.messageId })
      }
    }
    return { batchItemFailures }
  }
  const expireOrders = async (): Promise<{ expiradas: number }> => {
    const result = await bus.dispatch<{ expiradas: number }, Error>({ _tag: 'ExpirarOrdenes' })
    if (!result.ok) throw result.error
    return result.value
  }

  return {
    expressHandler: serverlessExpress({ app }) as unknown as ExpressLambda,
    processQueue,
    expireOrders,
  }
}

export const handler = async (event: LambdaEvent, context: object): Promise<unknown> => {
  runtime ??= createRuntime()
  const services = await runtime
  if (Array.isArray(event.Records)) return services.processQueue(event)
  if (event.task === 'expire-orders') return services.expireOrders()
  return services.expressHandler(event, context)
}
