// Exclusivamente desarrollo: genera claves de demo y las conserva en LocalStack.
import { generateKeyPairSync, createPublicKey } from 'node:crypto'
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'
const endpoint = process.env.AWS_ENDPOINT_URL
if (!endpoint || !['localstack', 'localhost', '127.0.0.1'].includes(new URL(endpoint).hostname))
  throw new Error('Bootstrap de secretos permitido solo en LocalStack')
const client = new SecretsManagerClient({
  region: 'us-east-1',
  endpoint,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
})
const escribir = async (Name: string, SecretString: string) => {
  try {
    await client.send(new CreateSecretCommand({ Name, SecretString }))
  } catch (error) {
    if ((error as { name: string }).name !== 'ResourceExistsException') throw error
    await client.send(new PutSecretValueCommand({ SecretId: Name, SecretString }))
  }
}
let privateKey: string
try {
  const r = await client.send(
    new GetSecretValueCommand({ SecretId: 'edtech/dev/referral-signing' }),
  )
  privateKey = String(JSON.parse(r.SecretString ?? '{}').privateKey ?? '')
  if (!privateKey) throw new Error('Secreto local de firma incompleto')
} catch (error) {
  if ((error as { name: string }).name !== 'ResourceNotFoundException') throw error
  const pair = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
    publicKeyEncoding: { format: 'pem', type: 'spki' },
  })
  privateKey = pair.privateKey
  await escribir('edtech/dev/referral-signing', JSON.stringify({ privateKey }))
}
const publicKey = createPublicKey(privateKey).export({ format: 'pem', type: 'spki' }).toString()
await escribir('edtech/dev/referral-verification', JSON.stringify({ publicKey }))
console.log(
  'Claves de atribución preparadas en LocalStack; no se muestran ni se guardan en archivos.',
)
