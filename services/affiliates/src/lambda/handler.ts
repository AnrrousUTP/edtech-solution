import express from 'express'
import serverlessExpress from '@codegenie/serverless-express'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import {
  errorMiddleware,
  noEncontradoMiddleware,
  requestContextMiddleware,
  validarContra,
  type SobreEvento,
} from '@edtech/shared-kernel'
import { AfiliacionHandler } from '../application/afiliacion/afiliacion.handler'
import { cargarConfig } from '../infrastructure/config/config'
import { crearRouter } from '../infrastructure/in/http/routes'
import { DynamoAfiliadosRepository } from '../infrastructure/out/persistencia/repositorio.dynamodb'
import { FirmadorEd25519 } from '../infrastructure/out/firmador'

type QueueRecord = { messageId: string; body: string }
type QueueEvent = { Records?: QueueRecord[] }
type QueueResponse = { batchItemFailures: Array<{ itemIdentifier: string }> }
type ExpressLambda = (event: object, context: object) => Promise<unknown>

let runtime:
  | Promise<{
      repo: DynamoAfiliadosRepository
      expressHandler: ExpressLambda
    }>
  | undefined

const createRuntime = async () => {
  const cfg = cargarConfig()
  const tableName = cfg.dynamoTable
  const parameterName = cfg.referralSigningParameter
  if (!tableName || !parameterName || !cfg.clientId || !cfg.jwksUri || !cfg.issuer) {
    throw new Error('Falta configurar tabla, Cognito o parámetro de firma para Affiliates Lambda')
  }

  const region = cfg.region
  const parameter = await new SSMClient({ region }).send(
    new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
  )
  const privateKey = parameter.Parameter?.Value
  if (!privateKey) throw new Error('El parámetro de firma de afiliados no tiene valor')

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: { removeUndefinedValues: true },
  })
  const repo = new DynamoAfiliadosRepository(client, tableName)
  const application = express()
  application.use(requestContextMiddleware)
  application.get('/health', (_req, res) => res.json({ ok: true, servicio: 'affiliates' }))
  application.get('/ready', (_req, res) => res.json({ listo: true, persistencia: 'dynamodb' }))
  application.use(
    '/api/affiliates',
    crearRouter(new AfiliacionHandler(repo, new FirmadorEd25519(privateKey)), cfg),
  )
  application.use(noEncontradoMiddleware)
  application.use(errorMiddleware)

  return {
    repo,
    expressHandler: serverlessExpress({ app: application }) as unknown as ExpressLambda,
  }
}

const eventEnvelope = (body: string): SobreEvento => {
  const outer = JSON.parse(body) as { detail?: unknown }
  const detail =
    typeof outer.detail === 'string' ? JSON.parse(outer.detail) : (outer.detail ?? outer)
  if (!detail || typeof detail !== 'object') throw new Error('Sobre de evento no válido')
  return detail as SobreEvento
}

const processQueue = async (
  records: QueueRecord[],
  repo: DynamoAfiliadosRepository,
): Promise<QueueResponse> => {
  const failures: QueueResponse['batchItemFailures'] = []
  for (const record of records) {
    try {
      const envelope = eventEnvelope(record.body)
      const validation = validarContra(envelope.eventType, envelope.payload)
      if (!validation.valido) throw new Error(`Evento inválido: ${validation.errores.join(', ')}`)
      await repo.procesar(envelope)
    } catch {
      failures.push({ itemIdentifier: record.messageId })
    }
  }
  return { batchItemFailures: failures }
}

export const handler = async (event: QueueEvent, context: object): Promise<unknown> => {
  runtime ??= createRuntime()
  const services = await runtime
  const queue = event as QueueEvent
  if (Array.isArray(queue.Records)) return processQueue(queue.Records, services.repo)
  return services.expressHandler(event, context)
}
