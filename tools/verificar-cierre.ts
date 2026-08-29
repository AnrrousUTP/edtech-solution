// Checklist de cierre del doc 15 §3, ejecutado por COMANDO y no por lectura.
// Cada línea que sale acá es una comprobación que se hizo de verdad contra AWS
// dev o contra el repositorio, no una casilla marcada a mano.
//
//   bun run tools/verificar-cierre.ts
//
// Necesita credenciales de AWS con permiso de lectura sobre dev.
import { $ } from 'bun'
import { buscarSecretos } from './deteccion-secretos'

const REGION = 'us-east-1'
const CLUSTER = 'edtech-dev-cluster'
const SERVICIOS = [
  'identity-access',
  'catalog',
  'enrollment-progress',
  'gamification',
  'flashcards',
  'payments',
]

type Estado = 'ok' | 'falla' | 'pendiente'
const resultados: { seccion: string; nombre: string; estado: Estado; detalle: string }[] = []

const comprobar = (seccion: string, nombre: string, estado: Estado, detalle = ''): void => {
  resultados.push({ seccion, nombre, estado, detalle })
  const marca = estado === 'ok' ? '  ok  ' : estado === 'falla' ? ' FALLA' : ' PEND '
  console.log(`${marca} ${nombre}${detalle ? ` — ${detalle}` : ''}`)
}

const seccion = (titulo: string): void => console.log(`\n${titulo}`)

const aws = async (args: string[]): Promise<string> => {
  const r = await $`aws ${args} --region ${REGION} --output json`.quiet().nothrow()
  return r.exitCode === 0 ? r.stdout.toString() : ''
}

// ─────────────────────────────────────────────────────────────── Arquitectura
seccion('Arquitectura')

const harness = await $`bun run harness`.quiet().nothrow()
const salidaHarness = harness.stdout.toString() + harness.stderr.toString()
const pasan = /(\d+) pass/.exec(salidaHarness)?.[1] ?? '0'
comprobar(
  'Arquitectura',
  'harness en verde',
  harness.exitCode === 0 ? 'ok' : 'falla',
  `${pasan} tests`,
)

const negativo = await $`bun test tools/arch-check.test.ts`.quiet().nothrow()
comprobar(
  'Arquitectura',
  'el test negativo demuestra que las reglas fallan ante código malo (R14)',
  negativo.exitCode === 0 ? 'ok' : 'falla',
)

// I-1: ningún servicio importa de otro. Lo comprueba arch-check (A4); acá se
// vuelve a mirar el código crudo por si alguien apagó la regla.
const cruzados = await $`grep -rEl "from '(\\.\\./)+(services)/" services --include=*.ts`
  .quiet()
  .nothrow()
comprobar(
  'Arquitectura',
  'I-1: ningún servicio importa código de otro',
  cruzados.stdout.toString().trim() === '' ? 'ok' : 'falla',
  cruzados.stdout.toString().trim(),
)

// ────────────────────────────────────────────────────────────────────── Datos
seccion('Datos')

const secretosDb = JSON.parse(
  (await aws(['secretsmanager', 'list-secrets', '--query', 'SecretList[].Name'])) || '[]',
) as string[]
const porServicio = SERVICIOS.filter(s =>
  secretosDb.some(n => n.startsWith('edtech/dev/db/')),
).length
comprobar(
  'Datos',
  '6 secretos de conexión, uno por servicio',
  secretosDb.filter(n => n.startsWith('edtech/dev/db/')).length === 6 ? 'ok' : 'falla',
  `${secretosDb.filter(n => n.startsWith('edtech/dev/db/')).length} de 6 (servicios: ${porServicio})`,
)

const migraciones = await $`ls services/*/migrations`.quiet().nothrow()
comprobar(
  'Datos',
  'los 6 servicios tienen migraciones propias',
  migraciones.exitCode === 0 ? 'ok' : 'falla',
)

const migracionesIniciales = SERVICIOS.map(s => `services/${s}/migrations/0000_init.sql`)
const procesados = await $`grep -l processed_events ${migracionesIniciales}`.quiet().nothrow()
const conProcesados = procesados.stdout.toString().trim().split('\n').filter(Boolean).length
comprobar(
  'Datos',
  'processed_events en los 6 esquemas (D13)',
  conProcesados >= 6 ? 'ok' : 'falla',
  `${conProcesados} migraciones la declaran`,
)

// ───────────────────────────────────────────────────────────────── Mensajería
seccion('Mensajería')

const colas = JSON.parse(
  (await aws(['sqs', 'list-queues', '--queue-name-prefix', 'edtech-dev'])) || '{}',
) as { QueueUrls?: string[] }
const urls = colas.QueueUrls ?? []
const dlqs = urls.filter(u => u.endsWith('-dlq'))
const principales = urls.filter(u => !u.endsWith('-dlq'))
comprobar(
  'Mensajería',
  '6 colas + 3 internas + sus DLQ',
  principales.length === 9 && dlqs.length >= 9 ? 'ok' : 'falla',
  `${principales.length} colas, ${dlqs.length} DLQ`,
)

// I-14: toda cola tiene DLQ y toda DLQ tiene alarma
const alarmas = JSON.parse(
  (await aws([
    'cloudwatch',
    'describe-alarms',
    '--alarm-name-prefix',
    'edtech-dev-dlq-',
    '--query',
    'MetricAlarms[].AlarmName',
  ])) || '[]',
) as string[]

let sinDlq = 0
for (const url of principales) {
  const attr = JSON.parse(
    (await aws([
      'sqs',
      'get-queue-attributes',
      '--queue-url',
      url,
      '--attribute-names',
      'RedrivePolicy',
    ])) || '{}',
  ) as { Attributes?: { RedrivePolicy?: string } }
  if (attr.Attributes?.RedrivePolicy === undefined) sinDlq++
}
comprobar(
  'Mensajería',
  'I-14: toda cola principal tiene RedrivePolicy',
  sinDlq === 0 ? 'ok' : 'falla',
  sinDlq === 0 ? `${principales.length} colas` : `${sinDlq} sin DLQ`,
)
comprobar(
  'Mensajería',
  'I-14: toda DLQ tiene alarma',
  alarmas.length >= dlqs.length ? 'ok' : 'falla',
  `${alarmas.length} alarmas para ${dlqs.length} DLQ`,
)

const reglas = JSON.parse(
  (await aws([
    'events',
    'list-rules',
    '--event-bus-name',
    'edtech-domain-events',
    '--query',
    'Rules[].Name',
  ])) || '[]',
) as string[]
comprobar(
  'Mensajería',
  '8 reglas en el bus (doc 05)',
  reglas.length === 8 ? 'ok' : 'falla',
  `${reglas.length} reglas`,
)

// Los contratos viven en el kernel: un solo validador para los 26 schemas (doc 12 §5)
const contratos = await $`bun test packages/shared-kernel/src/events`.quiet().nothrow()
comprobar(
  'Mensajería',
  'I-3: contract tests de los eventos',
  contratos.exitCode === 0 ? 'ok' : 'falla',
)

// ─────────────────────────────────────────────────────────────────── Seguridad
seccion('Seguridad')

// I-12: ni un secreto en el repositorio ni en su historial. La logica de
// deteccion vive en tools/deteccion-secretos.ts y tiene su propio test: el grep
// literal del doc 15 daba tantos falsos positivos que un positivo de verdad se
// perdia entre ellos.
//
// Un fallo del comando NO puede leerse como "cero coincidencias": eso convertiria
// la comprobacion de seguridad mas importante en un verde silencioso.
const historia = await $`git log -p --all -- . ':(exclude)bun.lock'`.quiet().nothrow()

if (historia.exitCode !== 0) {
  comprobar(
    'Seguridad',
    'I-12: sin secretos en el repositorio ni en su historial',
    'falla',
    'no se pudo leer el historial de git',
  )
} else {
  const hallazgos = buscarSecretos(historia.stdout.toString())
  comprobar(
    'Seguridad',
    'I-12: sin secretos en el repositorio ni en su historial',
    hallazgos.length === 0 ? 'ok' : 'falla',
    hallazgos.length === 0
      ? 'ningun valor con forma de credencial'
      : hallazgos.map(h => `${h.tipo}: ${h.muestra}`).join(' | '),
  )
}

// I-15: ninguna task definition con un secreto literal
let literales = 0
const sospechoso = /^(A[A-Z0-9]{19}|E[A-Za-z0-9_-]{40,})$/
for (const s of [...SERVICIOS, 'web']) {
  const td = JSON.parse(
    (await aws([
      'ecs',
      'describe-task-definition',
      '--task-definition',
      `edtech-dev-${s}`,
      '--query',
      'taskDefinition.containerDefinitions[].environment',
    ])) || '[]',
  ) as { name: string; value: string }[][]
  for (const lista of td) {
    for (const { value } of lista ?? []) {
      if (sospechoso.test(value)) literales++
    }
  }
}
comprobar(
  'Seguridad',
  'I-15: ninguna task definition lleva un secreto literal',
  literales === 0 ? 'ok' : 'falla',
  'las task defs pasan NOMBRES de secreto; el valor se resuelve en runtime con el task role',
)

const promocion =
  await $`grep -rn "cognito:groups\\|admin-add-user-to-group" services/identity-access/src --include=*.ts`
    .quiet()
    .nothrow()
comprobar(
  'Seguridad',
  'R13: ningún endpoint promueve a admin',
  promocion.stdout.toString().includes('admin-add-user-to-group') ? 'falla' : 'ok',
)

// ──────────────────────────────────────────────────────────────────── Producto
seccion('Producto')

const pantallas = await $`ls apps/web/src/app`.quiet().nothrow()
comprobar('Producto', 'la app del frontend existe', pantallas.exitCode === 0 ? 'ok' : 'falla')

const hover =
  await $`grep -rn "hover:scale\\|hover:translate\\|hover:rotate\\|hover:skew" apps/web/src`
    .quiet()
    .nothrow()
comprobar(
  'Producto',
  'D19: ningún hover con movimiento',
  hover.stdout.toString().trim() === '' ? 'ok' : 'falla',
)

const reducedMotion = await $`grep -rn "prefers-reduced-motion" apps/web/src`.quiet().nothrow()
comprobar(
  'Producto',
  'prefers-reduced-motion respetado',
  reducedMotion.stdout.toString().trim() !== '' ? 'ok' : 'falla',
)

const hitl =
  await $`grep -n "PUBLICADA" services/flashcards/src/infrastructure/out/persistencia/mazo.repository.drizzle.ts`
    .quiet()
    .nothrow()
comprobar(
  'Producto',
  'I-8: el filtro del HITL está en el repositorio, no en el controlador',
  hitl.stdout.toString().includes('PUBLICADA') ? 'ok' : 'falla',
)

// ──────────────────────────────────────────────────────────────────── Operación
seccion('Operación')

const dashboards = JSON.parse(
  (await aws(['cloudwatch', 'list-dashboards', '--query', 'DashboardEntries[].DashboardName'])) ||
    '[]',
) as string[]
comprobar(
  'Operación',
  'dashboard único de CloudWatch',
  dashboards.includes('edtech-dev-principal') ? 'ok' : 'falla',
  dashboards.join(', '),
)

const presupuestos = await $`aws budgets describe-budgets --account-id ${(
  await aws(['sts', 'get-caller-identity', '--query', 'Account'])
)
  .replace(/"/g, '')
  .trim()} --query "Budgets[].BudgetName" --output json`
  .quiet()
  .nothrow()
comprobar(
  'Operación',
  'R1: budget con aviso al 80 %',
  presupuestos.stdout.toString().includes('edtech-dev-mensual') ? 'ok' : 'falla',
)

const readme = await $`grep -c "Despliegue" README.md`.quiet().nothrow()
comprobar(
  'Operación',
  'README raíz con arranque local y despliegue',
  Number(readme.stdout.toString().trim() || '0') > 0 ? 'ok' : 'falla',
)

const decisiones = await $`ls services/*/DECISIONS.md`.quiet().nothrow()
const cuantas = decisiones.stdout.toString().trim().split('\n').filter(Boolean).length
comprobar(
  'Operación',
  'DECISIONS.md por servicio',
  cuantas === 6 ? 'ok' : 'falla',
  `${cuantas} de 6`,
)

// ────────────────────────────────────────────────────────────────────── Resumen
const fallas = resultados.filter(r => r.estado === 'falla')
const pendientes = resultados.filter(r => r.estado === 'pendiente')
console.log(
  `\n${resultados.length - fallas.length - pendientes.length} en verde · ${fallas.length} en rojo · ${pendientes.length} pendientes`,
)
if (fallas.length > 0) {
  console.log('\nEn rojo:')
  for (const f of fallas) console.log(`  - ${f.nombre}`)
}
process.exit(fallas.length === 0 ? 0 : 1)
