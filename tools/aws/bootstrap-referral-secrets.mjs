import { createPublicKey, generateKeyPairSync } from 'node:crypto'
import {
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager'
import { execFileSync } from 'node:child_process'

const region = process.env.AWS_REGION ?? 'us-east-1'
const profile = process.env.AWS_PROFILE ?? 'edtech'
process.env.AWS_PROFILE = profile
const account = execFileSync('aws', ['sts', 'get-caller-identity', '--profile', profile, '--region', region, '--query', 'Account', '--output', 'text'], { encoding: 'utf8' }).trim()
if (account !== '047600599757') throw new Error('El perfil no apunta a la cuenta de EdTech; cancelado')
const secrets = new SecretsManagerClient({ region })
const privateName = 'edtech/dev/referral-signing'
const publicName = 'edtech/dev/referral-verification'
let privateKey
let needsPrivateWrite = false
try {
  const stored = await secrets.send(new GetSecretValueCommand({ SecretId: privateName }))
  privateKey = JSON.parse(stored.SecretString ?? '{}').privateKey
} catch (error) {
  if (!['ResourceNotFoundException', 'InvalidRequestException'].includes(error.name)) throw error
}
if (!privateKey) {
  const pair = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
    publicKeyEncoding: { format: 'pem', type: 'spki' },
  })
  privateKey = pair.privateKey
  needsPrivateWrite = true
}
if (needsPrivateWrite) {
  await secrets.send(new PutSecretValueCommand({ SecretId: privateName, SecretString: JSON.stringify({ privateKey }) }))
}
const publicKey = createPublicKey(privateKey).export({ format: 'pem', type: 'spki' }).toString()
let savedPublicKey
try {
  savedPublicKey = JSON.parse((await secrets.send(new GetSecretValueCommand({ SecretId: publicName })).SecretString ?? '{}')).publicKey
} catch (error) {
  if (!['ResourceNotFoundException', 'InvalidRequestException'].includes(error.name)) throw error
}
if (savedPublicKey !== publicKey)
  await secrets.send(new PutSecretValueCommand({ SecretId: publicName, SecretString: JSON.stringify({ publicKey }) }))
console.log(`Claves de atribución configuradas en Secrets Manager para la cuenta ${account} (${profile}).`)
