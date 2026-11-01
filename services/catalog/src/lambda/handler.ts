import express from 'express'
import serverlessExpress from '@codegenie/serverless-express'
import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { LambdaClient } from '@aws-sdk/client-lambda'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { S3Client } from '@aws-sdk/client-s3'
import {
  CommandBus,
  QueryBus,
  RelojSistema,
  errorMiddleware,
  noEncontradoMiddleware,
  requestContextMiddleware,
  type IEventPublisher,
} from '@edtech/shared-kernel'
import { ActualizarContenidoHandler } from '../application/actualizar-contenido/actualizar-contenido.handler'
import { ActualizarCursoHandler } from '../application/actualizar-curso/actualizar-curso.handler'
import { CrearCursoHandler } from '../application/crear-curso/crear-curso.handler'
import { DespublicarCursoHandler } from '../application/despublicar-curso/despublicar-curso.handler'
import { PublicarCursoHandler } from '../application/publicar-curso/publicar-curso.handler'
import { GestionarBancoHandler } from '../application/gestionar-banco/gestionar-banco.handler'
import { GestionarCarreraHandler } from '../application/gestionar-carrera/gestionar-carrera.handler'
import {
  ListarCarrerasHandler,
  ListarCursosHandler,
  ObtenerCursoHandler,
} from '../application/consultar-catalogo/consultar-catalogo.handler'
import {
  ListarBancosAdminHandler,
  ObtenerEvaluacionHandler,
  ObtenerConocimientoPrevioHandler,
  ObtenerEvaluacionInicialHandler,
  ObtenerDiagnosticoHandler,
  ObtenerContextoTomoHandler,
  ObtenerLeccionAdminHandler,
  ObtenerLeccionHandler,
  ObtenerNivelacionHandler,
  ObtenerRefuerzoHandler,
  ObtenerRespuestasHandler,
} from '../application/consultar-contenido/consultar-contenido.handler'
import { cargarConfig } from '../infrastructure/config/config'
import { crearRouter } from '../infrastructure/in/http/routes'
import { EnrollmentLambdaGateway } from '../infrastructure/out/enrollment-lambda.gateway'
import {
  DynamoBancoRepository,
  DynamoCarreraRepository,
  DynamoCatalogStore,
  DynamoCursoRepository,
} from '../infrastructure/out/persistencia/repositorios.dynamodb'

type ExpressLambda = (event: object, context: object) => Promise<unknown>
type Runtime = { expressHandler: ExpressLambda; dynamodb: DynamoDBClient }

let runtime: Promise<Runtime> | undefined

const createRuntime = async (): Promise<Runtime> => {
  const cfg = cargarConfig()
  const tableName = cfg.dynamoTable
  if (!tableName?.trim()) throw new Error('Falta configurar DYNAMODB_TABLE para Catalog Lambda')

  const dynamodb = new DynamoDBClient({
    region: cfg.region,
    ...(cfg.awsEndpoint
      ? {
          endpoint: cfg.awsEndpoint,
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        }
      : {}),
  })
  const client = DynamoDBDocumentClient.from(dynamodb, {
    marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
  })
  const store = new DynamoCatalogStore(
    client,
    tableName,
    new S3Client({
      region: cfg.region,
      ...(cfg.awsEndpoint
        ? {
            endpoint: cfg.awsEndpoint,
            forcePathStyle: true,
            credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
          }
        : {}),
    }),
    cfg.bucketMedia,
  )
  const enrollmentAccess = new EnrollmentLambdaGateway(
    new LambdaClient({ region: cfg.region }),
    cfg.enrollmentFunctionName,
  )
  const cursos = new DynamoCursoRepository(store)
  const carreras = new DynamoCarreraRepository(store)
  const bancos = new DynamoBancoRepository(store)

  // Cada cambio agrega su evento a OUTBOX en la misma transacción DynamoDB.
  // El publicador Streams → EventBridge se activa por separado al habilitar el corte.
  const publisher: IEventPublisher = { publish: async () => undefined }
  const commands = new CommandBus()
  commands.register(new CrearCursoHandler(cursos))
  commands.register(new ActualizarCursoHandler(cursos, publisher))
  commands.register(new ActualizarContenidoHandler(cursos, store, publisher))
  commands.register(new PublicarCursoHandler(cursos, store, publisher, new RelojSistema()))
  commands.register(new DespublicarCursoHandler(cursos, publisher))
  commands.register(new GestionarCarreraHandler(carreras))
  commands.register(new GestionarBancoHandler(bancos))

  const queries = new QueryBus()
  queries.register(new ListarCursosHandler(store))
  queries.register(new ObtenerCursoHandler(store))
  queries.register(new ListarCarrerasHandler(store))
  queries.register(new ObtenerLeccionHandler(store))
  queries.register(new ObtenerLeccionAdminHandler(store))
  queries.register(new ObtenerEvaluacionHandler(store))
  queries.register(new ObtenerConocimientoPrevioHandler(store))
  queries.register(new ObtenerEvaluacionInicialHandler(store))
  queries.register(new ObtenerRefuerzoHandler(store))
  queries.register(new ObtenerNivelacionHandler(store))
  queries.register(new ObtenerDiagnosticoHandler(store))
  queries.register(new ObtenerContextoTomoHandler(store))
  queries.register(new ObtenerRespuestasHandler(store))
  queries.register(new ListarBancosAdminHandler(store))

  const app = express()
  app.use(requestContextMiddleware)
  app.get('/health', (_req, res) => res.json({ ok: true, servicio: 'catalog' }))
  app.get('/ready', async (_req, res) => {
    try {
      await dynamodb.send(new DescribeTableCommand({ TableName: tableName }))
      res.json({ listo: true, persistencia: 'dynamodb' })
    } catch {
      res.status(503).json({ listo: false, persistencia: 'dynamodb' })
    }
  })
  app.use(
    '/api/catalog',
    crearRouter(commands, queries, cfg, cfg.internoToken ?? '', enrollmentAccess),
  )
  app.use(noEncontradoMiddleware)
  app.use(errorMiddleware)
  return { expressHandler: serverlessExpress({ app }) as unknown as ExpressLambda, dynamodb }
}

export const handler: ExpressLambda = async (event, context) => {
  runtime ??= createRuntime()
  const services = await runtime
  return services.expressHandler(event, context)
}
