import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  DeleteParameterCommand,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm'
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager'
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
  service !== 'catalog' &&
  service !== 'identity-access' &&
  service !== 'affiliates' &&
  service !== 'flashcards' &&
  service !== 'gamification' &&
  service !== 'iot-terminals' &&
  service !== 'payments'
) {
  throw new Error('Indica un servicio HTTP soportado')
}
const privatePath =
  service === 'enrollment-progress'
    ? '/api/enrollment/mis-matriculas'
    : service === 'catalog'
      ? '/api/catalog/admin/cursos'
    : service === 'identity-access'
      ? '/api/identity/me'
    : service === 'affiliates'
      ? '/api/affiliates/me'
    : service === 'flashcards'
      ? '/api/flashcards/tomos/smoke-test'
      : service === 'gamification'
        ? '/api/gamification/mi-perfil'
      : service === 'payments'
        ? '/api/payments/mis-ordenes'
        : '/api/iot/me'
const artifactPath = `.local/lambda/${service}/${service}.zip`
const localstackEndpoint = process.env.LOCALSTACK_ENDPOINT ?? 'http://127.0.0.1:4566'
const localQueueUrl = queueName =>
  `${localstackEndpoint.replace(/\/$/, '')}/000000000000/${queueName}`
const dynamodbEndpoint =
  service === 'affiliates'
    ? localstackEndpoint
    : (process.env.DYNAMODB_LOCAL_ENDPOINT ?? 'http://127.0.0.1:8000')
const files = unzipSync(new Uint8Array(await readFile(artifactPath)))
const moduleBytes = files['handler.mjs']
if (!moduleBytes) throw new Error('El ZIP no contiene handler.mjs en su raíz')

const folder = await mkdtemp(join(tmpdir(), `edtech-${service}-lambda-`))
const tableName = `${service}-smoke-table-${process.pid}`
const ddb =
  service === 'catalog' ||
  service === 'identity-access' ||
  service === 'affiliates' ||
  service === 'iot-terminals' ||
  service === 'enrollment-progress' ||
  service === 'gamification'
    ? new DynamoDBClient({
        endpoint: dynamodbEndpoint,
        region: 'us-east-1',
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      })
    : undefined
let ssm
let referralParameterName
let secrets
let paypalSecretName
try {
  process.env.AWS_ENDPOINT_URL =
    service === 'payments' || service === 'affiliates' ? localstackEndpoint : dynamodbEndpoint
  process.env.AWS_ACCESS_KEY_ID = 'local'
  process.env.AWS_SECRET_ACCESS_KEY = 'local'
  process.env.PERSISTENCE = 'dynamodb'
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
    process.env.AWS_ENDPOINT_URL = dynamodbEndpoint
  }
  const handlerPath = join(folder, 'handler.mjs')
  await writeFile(handlerPath, moduleBytes)
  process.env.AWS_REGION = 'us-east-1'
  process.env.DYNAMODB_TABLE = tableName
  process.env.COGNITO_ISSUER = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test'
  process.env.COGNITO_CLIENT_ID = 'smoke-test-client'
  process.env.COGNITO_JWKS_URI = `${process.env.COGNITO_ISSUER}/.well-known/jwks.json`
  if (service === 'affiliates') {
    const { privateKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
      publicKeyEncoding: { format: 'pem', type: 'spki' },
    })
    ssm = new SSMClient({
      endpoint: localstackEndpoint,
      region: 'us-east-1',
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    })
    referralParameterName = `/edtech/lambda-smoke/${process.pid}`
    await ssm.send(
      new PutParameterCommand({
        Name: referralParameterName,
        Value: privateKey,
        Type: 'SecureString',
      }),
    )
    process.env.REFERRAL_SIGNING_PARAMETER_NAME = referralParameterName
  }
  if (service === 'payments') {
    secrets = new SecretsManagerClient({
      endpoint: localstackEndpoint,
      region: 'us-east-1',
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    })
    paypalSecretName = `edtech/lambda-smoke/paypal-${process.pid}`
    await secrets.send(
      new CreateSecretCommand({
        Name: paypalSecretName,
        SecretString: JSON.stringify({
          PAYPAL_ENV: 'sandbox',
          PAYPAL_CLIENT_ID: 'lambda-smoke',
          PAYPAL_CLIENT_SECRET: 'lambda-smoke',
          PAYPAL_WEBHOOK_ID: 'lambda-smoke',
          MONEDA_DEFAULT: 'USD',
        }),
      }),
    )
    process.env.PAYPAL_SECRET_NAME = paypalSecretName
  }
  if (service === 'enrollment-progress') process.env.CATALOG_FUNCTION_NAME = 'edtech-smoke-catalog'
  if (service === 'gamification') {
    process.env.BUCKET_MEDIA = 'smoke-gamification'
    process.env.QUEUE_CERTIFICADOS_URL = localQueueUrl('gamification-certificates')
  }
  if (service === 'payments') {
    process.env.PAYPAL_MODE = 'fake'
    process.env.QUEUE_WEBHOOKS_URL = localQueueUrl('payments-webhooks')
    process.env.URL_BASE = 'https://smoke-test.invalid'
  }
  if (service === 'iot-terminals') {
    process.env.IOT_DATA_ENDPOINT = 'https://iot-data.smoke.test'
    process.env.IOT_DEVICE_ID = 'terminal-demo-01'
    process.env.IOT_TOPIC_PREFIX = 'edtech/lowcost'
  }

  const { handler } = await import(pathToFileURL(handlerPath).href)
  const context = { awsRequestId: `${service}-smoke-test`, functionName: `${service}-local-smoke` }
  const invoke = async path => {
    try {
      return await handler(
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
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`${service} ${path}: ${detail}`)
    }
  }

  const health = await invoke('/health')
  assert.equal(health.statusCode, 200, 'Lambda responde healthcheck vía API Gateway v2')
  const unauthorized = await invoke(privatePath)
  assert.equal(unauthorized.statusCode, 401, 'La API privada rechaza solicitudes sin token')
  let publicCheck = ''
  if (service === 'catalog') {
    const cursos = await invoke('/api/catalog/cursos')
    assert.equal(cursos.statusCode, 200, 'El catálogo público consulta DynamoDB sin cuenta')
    publicCheck = '; catálogo DynamoDB 200'
  }
  if (service === 'gamification') {
    const certificado = await invoke('/api/gamification/certificados/EDT-ABCD-2345')
    assert.equal(certificado.statusCode, 404, 'La verificación pública consulta DynamoDB')
    publicCheck = '; consulta DynamoDB 404'
  }
  console.log(`${service} Lambda smoke test: health 200, endpoint privado 401${publicCheck}`)
} finally {
  if (ddb) {
    await ddb.send(new DeleteTableCommand({ TableName: tableName })).catch(() => undefined)
    ddb.destroy()
  }
  if (ssm && referralParameterName) {
    await ssm.send(new DeleteParameterCommand({ Name: referralParameterName })).catch(() => undefined)
    ssm.destroy()
  }
  if (secrets && paypalSecretName) {
    await secrets
      .send(new DeleteSecretCommand({ SecretId: paypalSecretName, ForceDeleteWithoutRecovery: true }))
      .catch(() => undefined)
    secrets.destroy()
  }
  await rm(folder, { recursive: true, force: true })
}
