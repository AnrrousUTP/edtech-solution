import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ListTablesCommand,
} from '@aws-sdk/client-dynamodb'
import { setTimeout as delay } from 'node:timers/promises'
import { unzipSync } from 'fflate'

if (Number(process.versions.node.split('.')[0]) < 22) {
  throw new Error('La prueba de integración Lambda requiere Node.js 22 o superior')
}
const service = process.argv[2]
if (
  service !== 'enrollment-progress' &&
  service !== 'flashcards' &&
  service !== 'iot-terminals' &&
  service !== 'payments'
) {
  throw new Error('Indica un servicio HTTP soportado')
}
const privatePath =
  service === 'enrollment-progress'
    ? '/api/enrollment/mis-matriculas'
    : service === 'flashcards'
      ? '/api/flashcards/tomos/smoke-test'
      : service === 'payments'
        ? '/api/payments/mis-ordenes'
        : '/api/iot/me'
const artifactPath = `.local/lambda/${service}/${service}.zip`
const files = unzipSync(new Uint8Array(await readFile(artifactPath)))
const moduleBytes = files['handler.mjs']
if (!moduleBytes) throw new Error('El ZIP no contiene handler.mjs en su raíz')

const folder = await mkdtemp(join(tmpdir(), `edtech-${service}-lambda-`))
const tableName = `${service}-smoke-table-${process.pid}`
const ddb =
  service === 'iot-terminals' || service === 'enrollment-progress'
    ? new DynamoDBClient({
        endpoint: 'http://127.0.0.1:8000',
        region: 'us-east-1',
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      })
    : undefined
try {
  if (ddb) {
    let localReady = false
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        await ddb.send(new ListTablesCommand({ Limit: 1 }))
        localReady = true
        break
      } catch {
        await delay(100)
      }
    }
    if (!localReady) throw new Error('DynamoDB Local no respondió en 3 segundos')
    await ddb.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'GSI1SK', AttributeType: 'S' },
          { AttributeName: 'GSI2PK', AttributeType: 'S' },
          { AttributeName: 'GSI2SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        GlobalSecondaryIndexes: ['GSI1', 'GSI2'].map(index => ({
          IndexName: index,
          KeySchema: [
            { AttributeName: `${index}PK`, KeyType: 'HASH' },
            { AttributeName: `${index}SK`, KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        })),
      }),
    )
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const description = await ddb.send(new DescribeTableCommand({ TableName: tableName }))
      if (description.Table?.TableStatus === 'ACTIVE') break
      await delay(100)
    }
    process.env.AWS_ENDPOINT_URL = 'http://127.0.0.1:8000'
  }
  const handlerPath = join(folder, 'handler.mjs')
  await writeFile(handlerPath, moduleBytes)
  process.env.AWS_REGION = 'us-east-1'
  process.env.DYNAMODB_TABLE = tableName
  process.env.COGNITO_ISSUER = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test'
  process.env.COGNITO_CLIENT_ID = 'smoke-test-client'
  process.env.COGNITO_JWKS_URI = `${process.env.COGNITO_ISSUER}/.well-known/jwks.json`
  if (service === 'enrollment-progress') process.env.CATALOG_FUNCTION_NAME = 'edtech-smoke-catalog'
  if (service === 'payments') {
    process.env.PAYPAL_MODE = 'fake'
    process.env.QUEUE_WEBHOOKS_URL = 'http://127.0.0.1:4566/000000000000/payments-webhooks'
  }
  if (service === 'iot-terminals') {
    process.env.IOT_DATA_ENDPOINT = 'https://iot-data-smoke-test.amazonaws.com'
    process.env.IOT_DEVICE_ID = 'terminal-demo-01'
    process.env.IOT_TOPIC_PREFIX = 'edtech/lowcost'
  }

  const { handler } = await import(pathToFileURL(handlerPath).href)
  const context = { awsRequestId: `${service}-smoke-test`, functionName: `${service}-local-smoke` }
  const invoke = path =>
    handler(
      {
        version: '2.0',
        routeKey: '$default',
        rawPath: path,
        rawQueryString: '',
        headers: { host: 'localhost', 'x-forwarded-proto': 'http' },
        requestContext: {
          accountId: 'local',
          apiId: 'local',
          domainName: 'localhost',
          domainPrefix: 'local',
          http: {
            method: 'GET',
            path,
            protocol: 'HTTP/1.1',
            sourceIp: '127.0.0.1',
            userAgent: 'Lambda smoke test',
          },
          requestId: `${service}-smoke-test`,
          routeKey: '$default',
          stage: '$default',
          time: new Date().toUTCString(),
          timeEpoch: Date.now(),
        },
        isBase64Encoded: false,
      },
      context,
    )

  const health = await invoke('/health')
  assert.equal(health.statusCode, 200, 'Lambda responde healthcheck vía API Gateway v2')
  const unauthorized = await invoke(privatePath)
  assert.equal(unauthorized.statusCode, 401, 'La API privada rechaza solicitudes sin token')
  console.log(`${service} Lambda smoke test: health 200, endpoint privado 401`)
} finally {
  if (ddb) {
    await ddb.send(new DeleteTableCommand({ TableName: tableName })).catch(() => undefined)
    ddb.destroy()
  }
  await rm(folder, { recursive: true, force: true })
}
