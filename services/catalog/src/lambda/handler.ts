import express, { type Request, type Response } from 'express'
import serverlessExpress from '@codegenie/serverless-express'
import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { S3Client } from '@aws-sdk/client-s3'
import {
  errorMiddleware,
  noEncontradoMiddleware,
  requestContextMiddleware,
} from '@edtech/shared-kernel'
import { DynamoCatalogStore } from '../infrastructure/out/persistencia/repositorios.dynamodb'
import { cargarConfig } from '../infrastructure/config/config'

type ExpressLambda = (event: object, context: object) => Promise<unknown>
type Runtime = { expressHandler: ExpressLambda }

let runtime: Promise<Runtime> | undefined

const envelope = (res: Response, data: unknown, status = 200): void => {
  res.status(status).json({ data })
}

const createRuntime = async (): Promise<Runtime> => {
  const cfg = cargarConfig()
  const tableName = cfg.dynamoTable
  if (!tableName?.trim()) throw new Error('Falta configurar DYNAMODB_TABLE para Catalog Lambda')

  const client = DynamoDBDocumentClient.from(
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
  const store = new DynamoCatalogStore(
    client,
    tableName,
    new S3Client({ region: cfg.region, ...(cfg.awsEndpoint ? { endpoint: cfg.awsEndpoint } : {}) }),
    cfg.bucketMedia,
  )

  const app = express()
  app.use(requestContextMiddleware)
  app.get('/health', (_req, res) => res.json({ ok: true, servicio: 'catalog' }))
  app.get('/ready', async (_req, res) => {
    try {
      await client.send(new DescribeTableCommand({ TableName: tableName }))
      res.json({ listo: true, persistencia: 'dynamodb' })
    } catch {
      res.status(503).json({ listo: false })
    }
  })

  // Estas son las lecturas públicas que necesita el recorrido QR → curso → checkout.
  // La Lambda no expone respuestas correctas, rutas administrativas ni escrituras.
  app.get('/api/catalog/cursos', async (_req, res, next) => {
    try {
      envelope(res, await store.listarCursos(false))
    } catch (error) {
      next(error)
    }
  })
  app.get('/api/catalog/cursos/:slugOId', async (req: Request, res, next) => {
    try {
      const slugOId = req.params.slugOId ?? ''
      const curso = /^[0-9a-f-]{36}$/i.test(slugOId)
        ? await store.cursoPorId(slugOId, false)
        : await store.cursoPorSlug(slugOId, false)
      if (!curso) {
        res
          .status(404)
          .json({ error: { code: 'CURSO_NO_ENCONTRADO', message: 'Curso no encontrado' } })
        return
      }
      envelope(res, curso)
    } catch (error) {
      next(error)
    }
  })
  app.get('/api/catalog/carreras', async (_req, res, next) => {
    try {
      envelope(res, await store.listarCarreras(false))
    } catch (error) {
      next(error)
    }
  })

  app.use(noEncontradoMiddleware)
  app.use(errorMiddleware)
  return { expressHandler: serverlessExpress({ app }) as unknown as ExpressLambda }
}

export const handler = async (event: object, context: object): Promise<unknown> => {
  runtime ??= createRuntime()
  const services = await runtime
  return services.expressHandler(event, context)
}
