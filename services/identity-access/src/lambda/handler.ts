import express from 'express'
import serverlessExpress from '@codegenie/serverless-express'
import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import {
  CommandBus,
  DynamoRepository,
  QueryBus,
  errorMiddleware,
  noEncontradoMiddleware,
  requestContextMiddleware,
  type IEventPublisher,
} from '@edtech/shared-kernel'
import { ActualizarPerfilHandler } from '../application/actualizar-perfil/actualizar-perfil.handler'
import { CrearUsuarioHandler } from '../application/crear-usuario/crear-usuario.handler'
import { FijarNivelPorTestHandler } from '../application/fijar-nivel-por-test/fijar-nivel-por-test.handler'
import { ListarUsuariosHandler } from '../application/listar-usuarios/listar-usuarios.handler'
import { ObtenerPerfilHandler } from '../application/obtener-perfil/obtener-perfil.handler'
import { SubirNivelPorCursoHandler } from '../application/subir-nivel/subir-nivel.handler'
import { cargarConfig } from '../infrastructure/config/config'
import { crearRouter } from '../infrastructure/in/http/routes'
import { DynamoUsuarioRepository } from '../infrastructure/out/persistencia/usuario.repository.dynamodb'

type LambdaHandler = (event: object, context: object) => Promise<unknown>

let runtime: Promise<{ expressHandler: LambdaHandler }> | undefined

const crearRuntime = async () => {
  const cfg = cargarConfig()
  if (cfg.persistence !== 'dynamodb' || !cfg.dynamoTable) {
    throw new Error('Identity Lambda requiere PERSISTENCE=dynamodb y DYNAMODB_TABLE')
  }
  if (!cfg.cognito.issuer.startsWith('https://') || !cfg.cognito.clientId || !cfg.cognito.jwksUri) {
    throw new Error('Identity Lambda requiere issuer, client ID y JWKS HTTPS de Cognito')
  }

  const dynamodbClient = new DynamoDBClient({
    region: cfg.region,
    ...(cfg.awsEndpoint
      ? {
          endpoint: cfg.awsEndpoint,
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        }
      : {}),
  })
  const documentClient = DynamoDBDocumentClient.from(dynamodbClient, {
    marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
  })
  const usuarios = new DynamoUsuarioRepository(
    new DynamoRepository(documentClient, cfg.dynamoTable),
  )
  // Los eventos ya se guardan como outbox dentro de la transacción del repositorio.
  const publisher: IEventPublisher = { publish: async () => undefined }

  const commands = new CommandBus()
  commands.register(new CrearUsuarioHandler(usuarios, publisher))
  commands.register(new ActualizarPerfilHandler(usuarios, publisher))
  commands.register(new SubirNivelPorCursoHandler(usuarios, publisher))
  commands.register(new FijarNivelPorTestHandler(usuarios, publisher))

  const queries = new QueryBus()
  queries.register(new ObtenerPerfilHandler(usuarios, publisher))
  queries.register(new ListarUsuariosHandler(usuarios))

  const app = express()
  app.use(requestContextMiddleware)
  app.get('/health', (_req, res) => res.json({ ok: true, servicio: 'identity-access' }))
  app.get('/ready', async (_req, res) => {
    try {
      await dynamodbClient.send(new DescribeTableCommand({ TableName: cfg.dynamoTable }))
      res.json({ listo: true, persistencia: 'dynamodb' })
    } catch {
      res.status(503).json({ listo: false, persistencia: 'dynamodb' })
    }
  })
  app.use('/api/identity', crearRouter(commands, queries, cfg))
  app.use(noEncontradoMiddleware)
  app.use(errorMiddleware)

  return {
    expressHandler: serverlessExpress({ app }) as unknown as LambdaHandler,
  }
}

export const handler: LambdaHandler = async (event, context) => {
  runtime ??= crearRuntime()
  const services = await runtime
  return services.expressHandler(event, context)
}
