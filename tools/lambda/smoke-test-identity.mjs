import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'

if (Number(process.versions.node.split('.')[0]) < 22) {
  throw new Error('La prueba de integración Lambda requiere Node.js 22 o superior')
}

const artifactPath = '.local/lambda/identity-access/identity-access.zip'
const files = unzipSync(new Uint8Array(await readFile(artifactPath)))
const moduleBytes = files['handler.mjs']
if (!moduleBytes) throw new Error('El ZIP no contiene handler.mjs')

const folder = await mkdtemp(join(tmpdir(), 'edtech-identity-lambda-'))
try {
  const handlerPath = join(folder, 'handler.mjs')
  await writeFile(handlerPath, moduleBytes)

  process.env.PERSISTENCE = 'dynamodb'
  process.env.DYNAMODB_TABLE = 'identity-smoke-table'
  process.env.AWS_REGION = 'us-east-1'
  process.env.COGNITO_ISSUER = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test'
  process.env.COGNITO_CLIENT_ID = 'smoke-test-client'
  process.env.COGNITO_JWKS_URI =
    'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test/.well-known/jwks.json'

  const { handler } = await import(pathToFileURL(handlerPath).href)
  const context = { awsRequestId: 'identity-smoke-test', functionName: 'identity-local-smoke' }
  const invoke = (path, method = 'GET') =>
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
            method,
            path,
            protocol: 'HTTP/1.1',
            sourceIp: '127.0.0.1',
            userAgent: 'Lambda smoke test',
          },
          requestId: 'identity-smoke-test',
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
  const unauthorized = await invoke('/api/identity/me')
  assert.equal(unauthorized.statusCode, 401, 'La ruta privada rechaza solicitudes sin token')
  console.log('identity Lambda smoke test: health 200, endpoint privado 401')
} finally {
  await rm(folder, { recursive: true, force: true })
}
