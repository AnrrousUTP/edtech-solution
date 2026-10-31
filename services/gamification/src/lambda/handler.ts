import express from 'express'
import serverlessExpress from '@codegenie/serverless-express'
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { SQSClient } from '@aws-sdk/client-sqs'
import {
  CommandBus,
  QueryBus,
  RelojSistema,
  errorMiddleware,
  noEncontradoMiddleware,
  parseSobre,
  requestContextMiddleware,
  xrayMiddleware,
} from '@edtech/shared-kernel'
import {
  MiPerfilHandler,
  VerificarCertificadoHandler,
} from '../application/consultar-gamificacion/consultar-gamificacion.handler'
import { ListarPerfilesAdminHandler } from '../application/listar-perfiles-admin/listar-perfiles-admin.handler'
import { GenerarPdfHandler } from '../application/generar-pdf/generar-pdf.handler'
import {
  OtorgarPorCarreraHandler,
  OtorgarPorCursoHandler,
} from '../application/otorgar-por-curso/otorgar-por-curso.handler'
import {
  CrearPerfilHandler,
  OtorgarEvaluacionPerfectaHandler,
  RegistrarActividadHandler,
} from '../application/registrar-actividad/registrar-actividad.handler'
import { cargarConfig } from '../infrastructure/config/config'
import { crearRouter } from '../infrastructure/in/http/routes'
import { crearProcesador } from '../infrastructure/in/messaging/sqs.consumer'
import { PdfCertificadoGenerador } from '../infrastructure/out/pdf.generador'
import {
  S3AlmacenPdf,
  SqsColaCertificados,
  crearS3Client,
} from '../infrastructure/out/s3-pdf.almacen'
import { DynamoEventInbox } from '../infrastructure/out/persistencia/inbox.dynamodb'
import {
  DynamoCertificadoRepository,
  DynamoPerfilRepository,
} from '../infrastructure/out/persistencia/repositorios.dynamodb'
import { DynamoRepository } from '@edtech/shared-kernel'

type QueueRecord = { messageId: string; body: string }
type QueueEvent = { Records?: QueueRecord[] }
type QueueResponse = { batchItemFailures: Array<{ itemIdentifier: string }> }
type LambdaHandler = (event: object, context: object) => Promise<unknown>

let runtime:
  | Promise<{
      http: LambdaHandler
      processQueue: (event: QueueEvent) => Promise<QueueResponse>
      dynamodb: DynamoDBClient
    }>
  | undefined

const createRuntime = async () => {
  const cfg = cargarConfig()
  if (cfg.persistence !== 'dynamodb' || !cfg.dynamoTable) {
    throw new Error('Gamification Lambda requiere PERSISTENCE=dynamodb y DYNAMODB_TABLE')
  }
  if (
    !cfg.cognito.issuer.startsWith('https://') ||
    !cfg.cognito.clientId ||
    !cfg.cognito.jwksUri?.startsWith('https://')
  ) {
    throw new Error('Gamification Lambda requiere issuer, client ID y JWKS HTTPS de Cognito')
  }
  if (!cfg.colaCertificadosUrl || !cfg.bucketMedia) {
    throw new Error('Gamification Lambda requiere cola de certificados y bucket S3')
  }

  const endpoint = cfg.awsEndpoint
  const credentials = endpoint ? { accessKeyId: 'local', secretAccessKey: 'local' } : undefined
  const dynamodb = new DynamoDBClient({
    region: cfg.region,
    ...(endpoint ? { endpoint, credentials } : {}),
  })
  const document = DynamoDBDocumentClient.from(dynamodb, {
    marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
  })
  const tabla = new DynamoRepository(document, cfg.dynamoTable)
  const perfiles = new DynamoPerfilRepository(tabla)
  const certificados = new DynamoCertificadoRepository(document, cfg.dynamoTable)
  const inbox = new DynamoEventInbox(document, cfg.dynamoTable)
  const s3 = crearS3Client({ region: cfg.region, endpoint })
  const sqs = new SQSClient({
    region: cfg.region,
    ...(endpoint ? { endpoint, credentials } : {}),
  })
  const almacen = new S3AlmacenPdf(s3, cfg.bucketMedia)
  const cola = new SqsColaCertificados(sqs, cfg.colaCertificadosUrl)
  const reloj = new RelojSistema()
  const aleatorio = (): number => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32

  const bus = new CommandBus()
  bus.register(
    new OtorgarPorCursoHandler(
      perfiles,
      certificados,
      cola,
      { publish: async () => undefined },
      reloj,
      aleatorio,
    ),
  )
  bus.register(
    new OtorgarPorCarreraHandler(
      perfiles,
      certificados,
      cola,
      { publish: async () => undefined },
      reloj,
      aleatorio,
    ),
  )
  bus.register(new RegistrarActividadHandler(perfiles, { publish: async () => undefined }, reloj))
  bus.register(new CrearPerfilHandler(perfiles))
  bus.register(
    new OtorgarEvaluacionPerfectaHandler(perfiles, { publish: async () => undefined }, reloj),
  )
  bus.register(new GenerarPdfHandler(certificados, new PdfCertificadoGenerador(), almacen))

  const queries = new QueryBus()
  queries.register(new MiPerfilHandler(perfiles, certificados))
  queries.register(new VerificarCertificadoHandler(certificados, almacen))
  queries.register(new ListarPerfilesAdminHandler(perfiles))

  const app = express()
  app.use(requestContextMiddleware)
  app.use(xrayMiddleware('gamification'))
  app.get('/health', (_req, res) => res.json({ ok: true, servicio: 'gamification' }))
  app.get('/ready', async (_req, res) => {
    try {
      await dynamodb.send(new DescribeTableCommand({ TableName: cfg.dynamoTable }))
      res.json({ listo: true, persistencia: 'dynamodb' })
    } catch {
      res.status(503).json({ listo: false, persistencia: 'dynamodb' })
    }
  })
  app.use('/api/gamification', crearRouter(bus, queries, cfg))
  app.use(noEncontradoMiddleware)
  app.use(errorMiddleware)

  const procesar = crearProcesador(inbox, bus)
  const processQueue = async ({ Records = [] }: QueueEvent): Promise<QueueResponse> => {
    const batchItemFailures: QueueResponse['batchItemFailures'] = []
    for (const record of Records) {
      const parsed = parseSobre(record.body)
      if (!parsed.ok || (await procesar(parsed.value)) === 'NACK') {
        batchItemFailures.push({ itemIdentifier: record.messageId })
      }
    }
    return { batchItemFailures }
  }

  return {
    http: serverlessExpress({ app }) as unknown as LambdaHandler,
    processQueue,
    dynamodb,
  }
}

export const handler: LambdaHandler = async (event, context) => {
  runtime ??= createRuntime()
  const services = await runtime
  if (event && typeof event === 'object' && 'Records' in event) {
    return services.processQueue(event as QueueEvent)
  }
  return services.http(event, context)
}
