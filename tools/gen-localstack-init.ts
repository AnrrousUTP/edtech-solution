// Genera tools/localstack-init/01-crear-recursos.sh desde tools/eventos.json (doc 13 §3).
// La misma fuente alimenta el módulo Terraform messaging/ — así no pueden divergir.
import eventos from './eventos.json'

const CUENTA = '000000000000' // cuenta fija de LocalStack
const REGION = 'us-east-1'
const arnCola = (nombre: string) => `arn:aws:sqs:${REGION}:${CUENTA}:${nombre}`

const lineas: string[] = [
  '#!/bin/bash',
  '# GENERADO por tools/gen-localstack-init.ts desde tools/eventos.json — NO editar a mano.',
  'set -euo pipefail',
  '',
  `awslocal events create-event-bus --name ${eventos.bus} 2>/dev/null || true`,
  '',
]

const visibilidad = (eventos.visibilidadPorCola ?? {}) as Record<string, number>
const cuentaCola = (nombre: string) => `edtech-dev-${nombre}`
const urlColaLocal = (nombre: string) =>
  `$(awslocal sqs get-queue-url --queue-name ${nombre} --query QueueUrl --output text)`
const arnRegla = (nombre: string) =>
  `arn:aws:events:${REGION}:${CUENTA}:rule/${eventos.bus}/edtech-dev-${nombre}`
const politicaEventBridge = (nombre: string, reglasOrigen: string[]) =>
  JSON.stringify({
    Policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: reglasOrigen.map(regla => ({
        Sid: `AllowEventBridgeSendMessage${regla.replace(/[^A-Za-z0-9]/g, '')}`,
        Effect: 'Allow',
        Principal: { Service: 'events.amazonaws.com' },
        Action: 'sqs:SendMessage',
        Resource: arnCola(nombre),
        Condition: {
          ArnEquals: { 'aws:SourceArn': arnRegla(regla) },
          StringEquals: { 'aws:SourceAccount': CUENTA },
        },
      })),
    }),
  })

for (const cola of [...eventos.colas, ...eventos.colasInternas]) {
  const nombre = `edtech-dev-${cola}`
  const vt = visibilidad[cola] ?? 180
  lineas.push(
    `awslocal sqs create-queue --queue-name ${nombre}-dlq --attributes MessageRetentionPeriod=1209600`,
    `awslocal sqs create-queue --queue-name ${nombre} --attributes '{` +
      `"VisibilityTimeout":"${vt}","MessageRetentionPeriod":"345600",` +
      `"RedrivePolicy":"{\\"deadLetterTargetArn\\":\\"${arnCola(`${nombre}-dlq`)}\\",\\"maxReceiveCount\\":\\"5\\"}"}'`,
  )
}
for (const regla of eventos.reglas) {
  const nombre = cuentaCola(`${regla.nombre}-entrega-dlq`)
  lineas.push(
    `awslocal sqs create-queue --queue-name ${nombre} --attributes MessageRetentionPeriod=1209600`,
  )
}
lineas.push('')

const destinos = [...new Set(eventos.reglas.map(regla => cuentaCola(regla.destino)))]
const colasEventBridge = [
  ...destinos,
  ...eventos.reglas.map(regla => cuentaCola(`${regla.nombre}-entrega-dlq`)),
]
for (const nombre of colasEventBridge) {
  const reglasOrigen = eventos.reglas
    .filter(
      regla =>
        cuentaCola(regla.destino) === nombre ||
        cuentaCola(`${regla.nombre}-entrega-dlq`) === nombre,
    )
    .map(regla => regla.nombre)
  lineas.push(
    `awslocal sqs set-queue-attributes --queue-url "${urlColaLocal(nombre)}" --attributes '${politicaEventBridge(nombre, reglasOrigen)}'`,
  )
}
lineas.push('')

for (const regla of eventos.reglas) {
  const patron =
    'detailTypes' in regla && regla.detailTypes
      ? { 'detail-type': regla.detailTypes }
      : { 'detail-type': (regla as { prefijos: string[] }).prefijos.map(p => ({ prefix: p })) }
  lineas.push(
    `awslocal events put-rule --event-bus-name ${eventos.bus} --name edtech-dev-${regla.nombre} \\`,
    `  --event-pattern '${JSON.stringify(patron)}'`,
    `awslocal events put-targets --event-bus-name ${eventos.bus} --rule edtech-dev-${regla.nombre} \\`,
    `  --targets '${JSON.stringify([
      {
        Id: '1',
        Arn: arnCola(cuentaCola(regla.destino)),
        DeadLetterConfig: { Arn: arnCola(cuentaCola(`${regla.nombre}-entrega-dlq`)) },
        RetryPolicy: { MaximumEventAgeInSeconds: 3600, MaximumRetryAttempts: 3 },
      },
    ])}'`,
    '',
  )
}

for (const bucket of eventos.buckets) {
  lineas.push(`awslocal s3 mb s3://${bucket} 2>/dev/null || true`)
}

lineas.push(
  '',
  '# Secreto de PayPal con valores dummy: el flujo real de pagos se prueba contra AWS dev (F8).',
  `awslocal secretsmanager create-secret --name edtech/dev/paypal --secret-string '{"env":"sandbox","clientId":"dummy-local","clientSecret":"dummy-local","webhookId":"dummy-local"}' 2>/dev/null || true`,
  '',
  'echo "[localstack-init] recursos creados"',
)

const salida = 'tools/localstack-init/01-crear-recursos.sh'
await Bun.write(salida, lineas.join('\n') + '\n')
console.log(`Escrito ${salida}`)
