import express from 'express'
import serverlessExpress from '@codegenie/serverless-express'
import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { SQSClient } from '@aws-sdk/client-sqs'
import { S3Client } from '@aws-sdk/client-s3'
import {
  CommandBus,
  QueryBus,
  RelojSistema,
  conContexto,
  parseSobre,
  errorMiddleware,
  noEncontradoMiddleware,
  requestContextMiddleware,
  type SobreEvento,
} from '@edtech/shared-kernel'
import { GenerarMazoHandler } from '../application/generar-mazo/generar-mazo.handler'
import { SolicitarGeneracionHandler } from '../application/solicitar-generacion/solicitar-generacion.handler'
import {
  AprobarTarjetaHandler,
  RechazarTarjetaHandler,
} from '../application/revisar-tarjetas/revisar-tarjetas.handler'
import {
  MazosDeTomoAdminHandler,
  TarjetasDeTomoHandler,
} from '../application/consultar-mazos/consultar-mazos.handler'
import type { GeneradorFlashcardsPort } from '../domain/ports-out/generador-flashcards.port'
import { cargarConfig } from '../infrastructure/config/config'
import { crearRouter } from '../infrastructure/in/http/routes'
import { crearProcesador } from '../infrastructure/in/messaging/sqs.consumer'
import {
  BedrockGeneradorFlashcards,
  crearBedrockClient,
} from '../infrastructure/out/bedrock-generador.flashcards'
import { FakeGeneradorFlashcards } from '../infrastructure/out/fake-generador.flashcards'
import { S3ContenidoFuente, SqsColaGeneracion } from '../infrastructure/out/s3-contenido.fuente'
import { DynamoEventInbox } from '../infrastructure/out/persistencia/inbox.dynamodb'
import { DynamoMazoRepository } from '../infrastructure/out/persistencia/mazo.repository.dynamodb'

type ExpressLambda = (event: object, context: object) => Promise<unknown>
type SqsRecord = { messageId?: string; body?: string }
type LambdaEvent = { Records?: SqsRecord[] }
type Runtime = {
  expressHandler: ExpressLambda
  procesar: (sobre: SobreEvento) => Promise<'ACK' | 'NACK'>
}

let runtime: Promise<Runtime> | undefined

const crearRuntime = async (): Promise<Runtime> => {
  const cfg = cargarConfig()
  const tableName = cfg.dynamoTable
  if (
    !tableName ||
    !cfg.cognito.issuer.startsWith('https://') ||
    !cfg.cognito.clientId ||
    !cfg.cognito.jwksUri?.startsWith('https://')
  ) {
    throw new Error('Falta configurar tabla DynamoDB o Cognito HTTPS para Flashcards Lambda')
  }

  const dynamodb = new DynamoDBClient({
    region: cfg.region,
    ...(cfg.awsEndpoint
      ? {
          endpoint: cfg.awsEndpoint,
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        }
      : {}),
  })
  const documentClient = DynamoDBDocumentClient.from(dynamodb, {
    marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
  })
  const sqs = new SQSClient({
    region: cfg.region,
    ...(cfg.awsEndpoint
      ? {
          endpoint: cfg.awsEndpoint,
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        }
      : {}),
  })
  const s3 = new S3Client({
    region: cfg.region,
    ...(cfg.awsEndpoint
      ? {
          endpoint: cfg.awsEndpoint,
          forcePathStyle: true,
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        }
      : {}),
  })
  const mazos = new DynamoMazoRepository(tableName, {
    region: cfg.region,
    ...(cfg.awsEndpoint ? { endpoint: cfg.awsEndpoint } : {}),
  })
  const inbox = new DynamoEventInbox(documentClient, tableName)
  const contenido = new S3ContenidoFuente(s3, cfg.bucket)
  const cola = new SqsColaGeneracion(sqs, cfg.colaGeneracionUrl ?? '')
  const generador: GeneradorFlashcardsPort =
    cfg.generador === 'bedrock'
      ? new BedrockGeneradorFlashcards(
          crearBedrockClient({ region: cfg.region }),
          cfg.bedrock.modelId,
        )
      : new FakeGeneradorFlashcards()
  // Los repositorios DynamoDB guardan eventos en outbox con el agregado.
  const publisher = { publish: async () => undefined }
  const reloj = new RelojSistema()

  const commands = new CommandBus()
  commands.register(new SolicitarGeneracionHandler(mazos, cola))
  commands.register(new GenerarMazoHandler(mazos, generador, contenido, publisher, reloj))
  commands.register(new AprobarTarjetaHandler(mazos, publisher, reloj))
  commands.register(new RechazarTarjetaHandler(mazos, publisher, reloj))
  const queries = new QueryBus()
  queries.register(new TarjetasDeTomoHandler(mazos))
  queries.register(new MazosDeTomoAdminHandler(mazos))

  const app = express()
  app.use(requestContextMiddleware)
  app.get('/health', (_req, res) =>
    res.json({ ok: true, servicio: 'flashcards', generador: cfg.generador }),
  )
  app.get('/ready', async (_req, res) => {
    try {
      await dynamodb.send(new DescribeTableCommand({ TableName: tableName }))
      res.json({ listo: true, persistencia: 'dynamodb' })
    } catch {
      res.status(503).json({ listo: false, persistencia: 'dynamodb' })
    }
  })
  app.use('/api/flashcards', crearRouter(commands, queries, cfg))
  app.use(noEncontradoMiddleware)
  app.use(errorMiddleware)
  return {
    expressHandler: serverlessExpress({ app }) as unknown as ExpressLambda,
    procesar: crearProcesador(inbox, commands),
  }
}

export const handler: ExpressLambda = async (event, context) => {
  runtime ??= crearRuntime()
  const services = await runtime
  const records = (event as LambdaEvent).Records
  if (!Array.isArray(records)) return services.expressHandler(event, context)

  const batchItemFailures: { itemIdentifier: string }[] = []
  for (const record of records) {
    const itemIdentifier = record.messageId
    if (!itemIdentifier || !record.body) {
      if (itemIdentifier) batchItemFailures.push({ itemIdentifier })
      continue
    }
    const sobre = parseSobre(record.body)
    if (!sobre.ok) {
      batchItemFailures.push({ itemIdentifier })
      continue
    }
    const resultado = await conContexto({ correlationId: sobre.value.correlationId }, () =>
      services.procesar(sobre.value),
    )
    if (resultado === 'NACK') batchItemFailures.push({ itemIdentifier })
  }
  return { batchItemFailures }
}
