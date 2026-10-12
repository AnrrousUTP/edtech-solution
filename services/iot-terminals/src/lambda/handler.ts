import express from 'express'
import serverlessExpress from '@codegenie/serverless-express'
import {
  errorMiddleware,
  noEncontradoMiddleware,
  parseSobre,
  requestContextMiddleware,
} from '@edtech/shared-kernel'
import { TerminalHandler } from '../application/terminal/terminal.handler'
import { cargarConfig } from '../infrastructure/config/config'
import { crearRouter } from '../infrastructure/in/http/routes'
import { crearProcesador } from '../infrastructure/in/messaging/consumer'
import { AwsIoTGateway } from '../infrastructure/out/aws-iot.gateway'
import { DynamoTerminalRepository } from '../infrastructure/out/persistencia/repositorio.dynamodb'

type SqsRecord = { messageId: string; body: string }
type SqsEvent = { Records: SqsRecord[] }
type SqsResponse = { batchItemFailures: { itemIdentifier: string }[] }
type ExpressLambda = (event: object, context: object) => Promise<unknown>

let runtime:
  | Promise<{
      expressHandler: ExpressLambda
      consume: (event: SqsEvent) => Promise<SqsResponse>
    }>
  | undefined

const crearRuntime = async () => {
  const cfg = cargarConfig()
  if (
    !cfg.dynamoTable ||
    !cfg.issuer.startsWith('https://') ||
    !cfg.clientId ||
    !cfg.jwksUri?.startsWith('https://') ||
    !cfg.iotEndpoint?.startsWith('https://')
  ) {
    throw new Error(
      'Falta configurar DynamoDB, Cognito o endpoint HTTPS de IoT para Terminales Lambda',
    )
  }
  const repo = new DynamoTerminalRepository(cfg.dynamoTable, cfg.deviceId, cfg.offlineMs, {
    region: cfg.region,
    ...(cfg.awsEndpoint ? { endpoint: cfg.awsEndpoint } : {}),
  })
  await repo.inicializar()
  const gateway = new AwsIoTGateway(cfg, repo)
  const app = express()
  app.use(requestContextMiddleware)
  app.get('/health', (_req, res) => res.json({ ok: true, servicio: 'iot-terminals' }))
  app.get('/ready', async (_req, res) => {
    try {
      await repo.configuracion()
      res.json({ listo: true, persistencia: 'dynamodb', iot: 'enabled' })
    } catch {
      res.status(503).json({ listo: false })
    }
  })
  const changed = () => gateway.flush(true)
  app.use('/api/iot', crearRouter(new TerminalHandler(repo, changed), cfg, changed))
  app.use(noEncontradoMiddleware)
  app.use(errorMiddleware)
  const expressHandler = serverlessExpress({ app }) as unknown as ExpressLambda
  const procesar = crearProcesador(repo, cfg.deviceId)
  const consume = async (event: SqsEvent): Promise<SqsResponse> => {
    const batchItemFailures: SqsResponse['batchItemFailures'] = []
    for (const record of event.Records ?? []) {
      const parsed = parseSobre(record.body)
      if (!parsed.ok) {
        batchItemFailures.push({ itemIdentifier: record.messageId })
        continue
      }
      if ((await procesar(parsed.value)) === 'NACK') {
        batchItemFailures.push({ itemIdentifier: record.messageId })
      }
    }
    return { batchItemFailures }
  }
  return { expressHandler, consume }
}

export const handler = async (event: object, context: object): Promise<unknown> => {
  runtime ??= crearRuntime()
  const app = await runtime
  if (event && typeof event === 'object' && 'Records' in event) {
    return app.consume(event as SqsEvent)
  }
  return app.expressHandler(event, context)
}
