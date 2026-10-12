import express from 'express'
import serverlessExpress from '@codegenie/serverless-express'
import {
  CommandBus,
  QueryBus,
  RelojSistema,
  errorMiddleware,
  noEncontradoMiddleware,
  requestContextMiddleware,
} from '@edtech/shared-kernel'
import {
  MazosDeTomoAdminHandler,
  TarjetasDeTomoHandler,
} from '../application/consultar-mazos/consultar-mazos.handler'
import {
  AprobarTarjetaHandler,
  RechazarTarjetaHandler,
} from '../application/revisar-tarjetas/revisar-tarjetas.handler'
import { cargarConfig } from '../infrastructure/config/config'
import { crearRouter } from '../infrastructure/in/http/routes'
import { DynamoMazoRepository } from '../infrastructure/out/persistencia/mazo.repository.dynamodb'

type ExpressLambda = (event: object, context: object) => Promise<unknown>
let runtime: Promise<{ expressHandler: ExpressLambda }> | undefined

const crearRuntime = async () => {
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
  const mazos = new DynamoMazoRepository(tableName, { region: cfg.region })
  const publisher = { publish: async () => undefined }
  const bus = new CommandBus()
  bus.register(new AprobarTarjetaHandler(mazos, publisher, new RelojSistema()))
  bus.register(new RechazarTarjetaHandler(mazos, publisher, new RelojSistema()))
  const queries = new QueryBus()
  queries.register(new TarjetasDeTomoHandler(mazos))
  queries.register(new MazosDeTomoAdminHandler(mazos))

  const app = express()
  app.use(requestContextMiddleware)
  app.get('/health', (_req, res) => res.json({ ok: true, servicio: 'flashcards' }))
  app.get('/ready', async (_req, res) => {
    try {
      await mazos.porTomoParaAdmin('__health_check__')
      res.json({ listo: true, persistencia: 'dynamodb' })
    } catch {
      res.status(503).json({ listo: false })
    }
  })
  app.use('/api/flashcards', crearRouter(bus, queries, cfg))
  app.use(noEncontradoMiddleware)
  app.use(errorMiddleware)
  return { expressHandler: serverlessExpress({ app }) as unknown as ExpressLambda }
}

export const handler: ExpressLambda = async (event, context) => {
  runtime ??= crearRuntime()
  const app = await runtime
  return app.expressHandler(event, context)
}
