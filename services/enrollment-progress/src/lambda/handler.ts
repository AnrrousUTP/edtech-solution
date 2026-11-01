import express from 'express'
import serverlessExpress from '@codegenie/serverless-express'
import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { LambdaClient } from '@aws-sdk/client-lambda'
import {
  CommandBus,
  QueryBus,
  RelojSistema,
  UniqueId,
  errorMiddleware,
  noEncontradoMiddleware,
  parseSobre,
  requestContextMiddleware,
} from '@edtech/shared-kernel'
import type { Command, SobreEvento } from '@edtech/shared-kernel'
import {
  CrearMatriculaHandler,
  RevocarMatriculaHandler,
} from '../application/crear-matricula/crear-matricula.handler'
import { CompletarLeccionHandler } from '../application/completar-leccion/completar-leccion.handler'
import {
  ConocimientoPrevioEstadoHandler,
  EvaluacionInicialHandler,
  MisMatriculasHandler,
  ProgresoCursoHandler,
} from '../application/consultar-progreso/consultar-progreso.handler'
import {
  EntregarIntentoHandler,
  IniciarIntentoHandler,
} from '../application/gestionar-intento/gestionar-intento.handler'
import {
  ActualizarTomoProyeccionHandler,
  DespublicarProyeccionHandler,
  ProyectarCursoHandler,
} from '../application/actualizar-proyeccion/actualizar-proyeccion.handler'
import { cargarConfig } from '../infrastructure/config/config'
import { crearRouter } from '../infrastructure/in/http/routes'
import {
  onContenidoActualizado,
  onCursoDespublicado,
  onCursoPublicado,
} from '../infrastructure/in/messaging/on-catalog.handler'
import { onPagoConfirmado, onPagoReembolsado } from '../infrastructure/in/messaging/on-pago.handler'
import { CatalogLambdaGateway } from '../infrastructure/out/catalog-lambda.gateway'
import {
  DynamoCursoProyeccionRepository,
  DynamoEnrollmentStore,
  DynamoIntentoRepository,
  DynamoMatriculaRepository,
} from '../infrastructure/out/persistencia/repositorios.dynamodb'

type SqsRecord = { messageId: string; body: string }
type SqsEvent = { Records?: SqsRecord[] }
type SqsResponse = { batchItemFailures: { itemIdentifier: string }[] }
type CourseAccessTask = { task: 'verify-course-access'; usuarioId: string; cursoId: string }
type LambdaHandler = (event: object, context: object) => Promise<unknown>
type Translator = (event: SobreEvento) => Command | null

const translators: Record<string, Translator> = {
  'payments.pago-confirmado.v1': onPagoConfirmado,
  'payments.pago-reembolsado.v1': onPagoReembolsado,
  'catalog.curso-publicado.v1': onCursoPublicado,
  'catalog.curso-despublicado.v1': onCursoDespublicado,
  'catalog.contenido-actualizado.v1': onContenidoActualizado,
}

let runtime:
  | Promise<{
      http: LambdaHandler
      dynamodb: DynamoDBClient
      processQueue: (event: SqsEvent) => Promise<SqsResponse>
      verifyCourseAccess: (usuarioId: string, cursoId: string) => Promise<boolean>
    }>
  | undefined

const createRuntime = async () => {
  const cfg = cargarConfig()
  if (cfg.persistence !== 'dynamodb' || !cfg.dynamoTable) {
    throw new Error('Enrollment Lambda requiere PERSISTENCE=dynamodb y DYNAMODB_TABLE')
  }
  if (
    !cfg.cognito.issuer.startsWith('https://') ||
    !cfg.cognito.clientId ||
    !cfg.cognito.jwksUri?.startsWith('https://')
  ) {
    throw new Error('Enrollment Lambda requiere issuer, client ID y JWKS HTTPS de Cognito')
  }
  if (!cfg.catalogFunctionName) throw new Error('Enrollment Lambda requiere CATALOG_FUNCTION_NAME')

  const dynamodb = new DynamoDBClient({
    region: cfg.region,
    ...(cfg.awsEndpoint
      ? {
          endpoint: cfg.awsEndpoint,
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        }
      : {}),
  })
  const store = new DynamoEnrollmentStore(
    (await import('@aws-sdk/lib-dynamodb')).DynamoDBDocumentClient.from(dynamodb, {
      marshallOptions: { removeUndefinedValues: true },
    }),
    cfg.dynamoTable,
  )
  const matriculas = new DynamoMatriculaRepository(store)
  const intentos = new DynamoIntentoRepository(store)
  const proyeccion = new DynamoCursoProyeccionRepository(store)
  const catalog = new CatalogLambdaGateway(
    new LambdaClient({ region: cfg.region }),
    cfg.catalogFunctionName,
  )
  // Dynamo repositorios escriben eventos outbox en la misma TransactWrite que el agregado.
  const publisher = { publish: async () => undefined }
  const reloj = new RelojSistema()

  const commands = new CommandBus()
  commands.register(new CrearMatriculaHandler(matriculas, proyeccion, publisher))
  commands.register(new RevocarMatriculaHandler(matriculas))
  commands.register(
    new CompletarLeccionHandler(matriculas, intentos, proyeccion, catalog, publisher, reloj),
  )
  commands.register(new IniciarIntentoHandler(intentos, matriculas, proyeccion, reloj))
  commands.register(
    new EntregarIntentoHandler(
      intentos,
      matriculas,
      proyeccion,
      catalog,
      catalog,
      publisher,
      reloj,
    ),
  )
  commands.register(new ProyectarCursoHandler(proyeccion))
  commands.register(new DespublicarProyeccionHandler(proyeccion))
  commands.register(new ActualizarTomoProyeccionHandler(proyeccion))

  const queries = new QueryBus()
  queries.register(new EvaluacionInicialHandler(intentos))
  queries.register(new ConocimientoPrevioEstadoHandler(intentos, matriculas, proyeccion, reloj))
  queries.register(new MisMatriculasHandler(matriculas, proyeccion))
  queries.register(new ProgresoCursoHandler(matriculas, proyeccion, reloj))

  const app = express()
  app.use(requestContextMiddleware)
  app.get('/health', (_req, res) => res.json({ ok: true, servicio: 'enrollment-progress' }))
  app.get('/ready', async (_req, res) => {
    try {
      await dynamodb.send(new DescribeTableCommand({ TableName: cfg.dynamoTable }))
      res.json({ listo: true, persistencia: 'dynamodb' })
    } catch {
      res.status(503).json({ listo: false, persistencia: 'dynamodb' })
    }
  })
  app.use('/api/enrollment', crearRouter(commands, queries, cfg))
  app.use(noEncontradoMiddleware)
  app.use(errorMiddleware)

  const processQueue = async ({ Records = [] }: SqsEvent): Promise<SqsResponse> => {
    const batchItemFailures: SqsResponse['batchItemFailures'] = []
    for (const record of Records) {
      const parsed = parseSobre(record.body)
      if (!parsed.ok) {
        batchItemFailures.push({ itemIdentifier: record.messageId })
        continue
      }
      const event = parsed.value
      const translator = translators[event.eventType]
      if (!translator) continue
      let command: Command | null
      try {
        command = translator(event)
      } catch {
        batchItemFailures.push({ itemIdentifier: record.messageId })
        continue
      }
      if (!command) continue
      try {
        const result = await commands.dispatch(command)
        if (!result.ok) batchItemFailures.push({ itemIdentifier: record.messageId })
      } catch {
        batchItemFailures.push({ itemIdentifier: record.messageId })
      }
    }
    return { batchItemFailures }
  }

  const verifyCourseAccess = async (usuarioId: string, cursoId: string): Promise<boolean> => {
    const matricula = await matriculas.porUsuarioYCurso(
      UniqueId.desde(usuarioId),
      UniqueId.desde(cursoId),
    )
    return matricula?.tieneAcceso(reloj.ahora()) ?? false
  }

  return {
    http: serverlessExpress({ app }) as unknown as LambdaHandler,
    dynamodb,
    processQueue,
    verifyCourseAccess,
  }
}

export const handler: LambdaHandler = async (event, context) => {
  runtime ??= createRuntime()
  const services = await runtime
  const sqs = event as SqsEvent
  if (Array.isArray(sqs.Records)) return services.processQueue(sqs)
  const task = event as Partial<CourseAccessTask>
  if (task.task === 'verify-course-access') {
    if (typeof task.usuarioId !== 'string' || typeof task.cursoId !== 'string')
      return { hasAccess: false }
    return { hasAccess: await services.verifyCourseAccess(task.usuarioId, task.cursoId) }
  }
  return services.http(event, context)
}
