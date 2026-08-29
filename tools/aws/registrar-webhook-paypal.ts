// Alta IDEMPOTENTE del webhook de PayPal (doc 09 §6.1) y guardado del
// webhookId en Secrets Manager. Antes de crear, consulta los existentes y
// reutiliza el que ya apunte a la URL correcta: PayPal limita cuántos webhooks
// admite una app, y duplicados entregan el mismo evento dos veces.
//
//   URL_WEBHOOK=https://.../api/payments/webhook bun run tools/aws/registrar-webhook-paypal.ts
import {
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager'

const SECRETO = process.env.PAYPAL_SECRET_NAME ?? 'edtech/dev/paypal'
const URL_WEBHOOK = process.env.URL_WEBHOOK
if (!URL_WEBHOOK) {
  console.error('Falta URL_WEBHOOK')
  process.exit(1)
}

const EVENTOS = [
  'CHECKOUT.ORDER.APPROVED',
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.CAPTURE.DENIED',
  'PAYMENT.CAPTURE.REFUNDED',
]

const secretos = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' })

const leido = await secretos.send(new GetSecretValueCommand({ SecretId: SECRETO }))
const credenciales = JSON.parse(leido.SecretString ?? '{}') as Record<string, string>
const base =
  credenciales.env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'

const basic = Buffer.from(`${credenciales.clientId}:${credenciales.clientSecret}`).toString(
  'base64',
)
const tokenResp = await fetch(`${base}/v1/oauth2/token`, {
  method: 'POST',
  headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials',
})
if (!tokenResp.ok) {
  console.error(`oauth2 falló: ${tokenResp.status} ${await tokenResp.text()}`)
  process.exit(1)
}
const { access_token } = (await tokenResp.json()) as { access_token: string }
const auth = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }

// 1. Reutilizar si ya existe uno con esa URL (doc 09 §6.1)
const listaResp = await fetch(`${base}/v1/notifications/webhooks`, { headers: auth })
const lista = (await listaResp.json()) as { webhooks?: { id: string; url: string }[] }
let webhookId = lista.webhooks?.find(w => w.url === URL_WEBHOOK)?.id ?? ''

if (webhookId) {
  console.log(`Webhook ya existente para esa URL, se reutiliza: ${webhookId}`)
} else {
  const crearResp = await fetch(`${base}/v1/notifications/webhooks`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      url: URL_WEBHOOK,
      event_types: EVENTOS.map(name => ({ name })),
    }),
  })
  const cuerpo = await crearResp.text()
  if (!crearResp.ok) {
    console.error(`No se pudo crear el webhook: ${crearResp.status} ${cuerpo}`)
    console.error(`Webhooks existentes: ${JSON.stringify(lista.webhooks ?? [])}`)
    process.exit(1)
  }
  webhookId = (JSON.parse(cuerpo) as { id: string }).id
  console.log(`Webhook creado: ${webhookId}`)
}

// 2. Guardar el webhookId en el secreto, sin tocar el resto de las credenciales
await secretos.send(
  new PutSecretValueCommand({
    SecretId: SECRETO,
    SecretString: JSON.stringify({ ...credenciales, webhookId }),
  }),
)
console.log(`webhookId guardado en ${SECRETO}`)
