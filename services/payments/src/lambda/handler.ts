import express from 'express'
import serverlessExpress from '@codegenie/serverless-express'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import {
  CommandBus,
  QueryBus,
  RelojSistema,
  crearSqsClient,
  errorMiddleware,
  noEncontradoMiddleware,
  parseSobre,
  requestContextMiddleware,
  xrayMiddleware,
} from '@edtech/shared-kernel'
import { CapturarPagoHandler } from '../application/capturar-pago/capturar-pago.handler'
import {
  DespublicarPrecioHandler,
  EstadoOrdenHandler,
  ExpirarOrdenesHandler,
  MisOrdenesHandler,
  ProyectarPrecioHandler,
  TodasLasOrdenesHandler,
} from '../application/consultar-ordenes/consultar-ordenes.handler'
import { CrearOrdenHandler } from '../application/crear-orden/crear-orden.handler'
import { ProcesarWebhookHandler } from '../application/procesar-webhook/procesar-webhook.handler'
import { cargarConfig } from '../infrastructure/config/config'
import { crearRouter } from '../infrastructure/in/http/routes'
import { crearRutaWebhook } from '../infrastructure/in/http/webhook.route'
import { crearProcesador } from '../infrastructure/in/messaging/sqs.consumer'
import { VerificadorEd25519 } from '../infrastructure/out/atribucion.verifier'
import { PaypalGateway, type CredencialesPaypal } from '../infrastructure/out/paypal/paypal.gateway'
import { PaypalLocalGateway } from '../infrastructure/out/paypal/paypal-local.gateway'
import {
  DynamoPaymentsRepository,
  DynamoPrecioProyeccionRepository,
} from '../infrastructure/out/persistencia/repositorio.dynamodb'
import { SqsColaWebhooks } from '../infrastructure/out/sqs-cola-webhooks'

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

const runtimePaymentCredentials = async (
  cfg: ReturnType<typeof cargarConfig>,
): Promise<CredencialesPaypal> => {
  if (cfg.paypalMode === 'fake') {
    return { env: 'sandbox', clientId: '', clientSecret: '', webhookId: '', moneda: 'USD' }
  }
  const result = await new SSMClient({ region: cfg.region }).send(
    new GetParameterCommand({ Name: cfg.paypalParameterName, WithDecryption: true }),
  )
  const raw = result.Parameter?.Value
  if (!raw) throw new Error('El parámetro seguro de PayPal no tiene valor')
  const parsed = JSON.parse(raw) as Partial<CredencialesPaypal>
  if (!parsed.clientId || !parsed.clientSecret || !parsed.webhookId) {
    throw new Error('El parámetro de PayPal debe incluir clientId, clientSecret y webhookId')
  }
  return {
    env: parsed.env === 'live' ? 'live' : 'sandbox',
    clientId: parsed.clientId,
    clientSecret: parsed.clientSecret,
    webhookId: parsed.webhookId,
    moneda: parsed.moneda ?? 'USD',
  }
}

const runtimeReferralVerifier = async (
  cfg: ReturnType<typeof cargarConfig>,
): Promise<VerificadorEd25519 | undefined> => {
  if (!cfg.referralVerificationParameterName) return undefined
  const result = await new SSMClient({ region: cfg.region }).send(
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
  if (!cfg.colaWebhooksUrl) throw new Error('Falta configurar la cola de webhooks de pagos')

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
  const secrets = await runtimePaymentCredentials(cfg)
  const paymentGateway =
    cfg.paypalMode === 'fake' ? new PaypalLocalGateway() : new PaypalGateway(secrets)
  const verifier = await runtimeReferralVerifier(cfg)
  const sqs = crearSqsClient({ region: cfg.region, endpoint: cfg.awsEndpoint })
  const queue = new SqsColaWebhooks(sqs, cfg.colaWebhooksUrl)
  // DynamoPaymentsRepository guarda cada DomainEvent dentro de la misma
  // transacción que su orden. La Lambda outbox publicadora de DynamoDB Streams
  // es el único puente a EventBridge: publicar aquí también duplicaría eventos.
  const publisher = { publish: async () => undefined }
  const reloj = new RelojSistema()
  const bus = new CommandBus()
  bus.register(new CrearOrdenHandler(orders, prices, paymentGateway, publisher, reloj, verifier))
  bus.register(new CapturarPagoHandler(orders, paymentGateway, publisher, reloj))
  bus.register(new ProcesarWebhookHandler(orders, orders, publisher, reloj, () => bus))
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
  // La firma de PayPal se valida contra el texto exacto antes del JSON parser.
  app.use('/api/payments', crearRutaWebhook(paymentGateway, orders, queue))
  app.use('/api/payments', crearRouter(bus, queries, cfg))
  app.use(noEncontradoMiddleware)
  app.use(errorMiddleware)

  const processMessage = crearProcesador(bus, orders)
  const processQueue = async (event: QueueEvent): Promise<QueueResponse> => {
    const batchItemFailures: QueueResponse['batchItemFailures'] = []
    for (const record of event.Records ?? []) {
      const parsed = parseSobre(record.body)
      if (!parsed.ok || (await processMessage(parsed.value)) === 'NACK') {
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
