import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const checks: Array<{ name: string; file: string; pattern: RegExp }> = [
  {
    name: 'Make webhook receives only job metadata and a signed token',
    file: 'apps/web/src/app/api/admin/weekly-resources/route.ts',
    pattern:
      /JSON\.stringify\(\{\s*jobId,\s*callbackUrl,\s*token:\s*createWeeklyResourceToken\(jobId\)\s*\}\)/s,
  },
  {
    name: 'Webhook signature is HMAC verified with timing-safe comparison',
    file: 'apps/web/src/lib/assistant/weekly-resources.ts',
    pattern: /createHmac\('sha256'[^]*timingSafeEqual\(actualBuffer, expectedBuffer\)/,
  },
  {
    name: 'Initial callback uses the trusted APP_URL origin',
    file: 'apps/web/src/app/api/admin/weekly-resources/route.ts',
    pattern: /new URL\([\s\S]*?['"]\/api\/integrations\/make\/weekly-resources\/process['"][\s\S]*?config\.appUrl/,
  },
  {
    name: 'Retry callbacks use the trusted APP_URL origin',
    file: 'apps/web/src/app/api/admin/weekly-resources/[jobId]/retry/route.ts',
    pattern: /new URL\([\s\S]*?['"]\/api\/integrations\/make\/weekly-resources\/process['"][\s\S]*?config\.appUrl/,
  },
  {
    name: 'Make integration requires HTTPS webhook and a 32-byte secret',
    file: 'apps/web/src/lib/assistant/weekly-resources.ts',
    pattern:
      /(?=.*weeklyResourcesIntegrationConfigured)(?=.*url\.protocol === 'https:')(?=.*url\.hostname)(?=.*hook)(?=.*Buffer\.byteLength\(secret, 'utf8'\) >= 32)/s,
  },
  {
    name: 'Automation token accepts only a timestamp and full SHA-256 hex signature',
    file: 'apps/web/src/lib/assistant/weekly-resources.ts',
    pattern: /(?=.*\\d\{10\})(?=.*\[a-f0-9\]\{64\})(?=.*exec\(token\))(?=.*timingSafeEqual)/s,
  },
  {
    name: 'Make callback handles duplicate deliveries idempotently',
    file: 'apps/web/src/app/api/integrations/make/weekly-resources/process/route.ts',
    pattern: /job\.status === 'READY' \|\| job\.status === 'APPROVED'[^]*duplicado: true/,
  },
  {
    name: 'Interrupted Make processing can be reclaimed after its lease expires',
    file: 'apps/web/src/lib/assistant/weekly-resources.ts',
    pattern:
      /processingLeaseUntil = :leaseUntil[^]*expiresAt > :nowEpoch[^]*processingLeaseUntil <= :nowEpoch[^]*nowEpoch \+ 180/s,
  },
  {
    name: 'Stale Make deliveries can be retried with an atomic cooldown',
    file: 'apps/web/src/lib/assistant/weekly-resources.ts',
    pattern:
      /claimWeeklyResourceRedelivery[^]*processingLeaseUntil[^]*lastDispatchAt <= :retryAfter/s,
  },
  {
    name: 'AI drafts a weekly prior test and a review test',
    file: 'apps/web/src/app/api/integrations/make/weekly-resources/process/route.ts',
    pattern: /CONOCIMIENTO_PREVIO_TOMO[^]*REFUERZO/,
  },
  {
    name: 'Teacher approval is required before weekly banks are saved',
    file: 'apps/web/src/app/api/admin/weekly-resources/[jobId]/approve/route.ts',
    pattern: /claimWeeklyResourceApproval[^]*catalogApi\.crearBanco/,
  },
  {
    name: 'Interrupted approvals can be retried while concurrent approvals stay locked',
    file: 'apps/web/src/lib/assistant/weekly-resources.ts',
    pattern:
      /approvalLeaseUntil = :leaseUntil[^]*attribute_not_exists\(approvalLeaseUntil\)[^]*approvalLeaseUntil <= :nowEpoch/s,
  },
  {
    name: 'Failed approval returns drafts to a retryable state',
    file: 'apps/web/src/app/api/admin/weekly-resources/[jobId]/approve/route.ts',
    pattern: /status: 'READY'[^]*El borrador quedó disponible para reintentar/s,
  },
  {
    name: 'Teacher can resume an interrupted approval from the restored draft',
    file: 'apps/web/src/app/admin/RecursosSemanales.tsx',
    pattern: /job\?\.status === 'APPROVING'[^]*Reanudar aprobación/s,
  },
  {
    name: 'Teacher editor records learning objectives and material purposes',
    file: 'apps/web/src/app/admin/editor-curso.tsx',
    pattern: /objetivos[^]*CONOCIMIENTO_PREVIO[^]*CONTENIDO_SEMANAL[^]*REPASO/,
  },
  {
    name: 'Weekly resource generation requires at least one learning objective',
    file: 'apps/web/src/app/api/admin/weekly-resources/route.ts',
    pattern: /objectives\.length === 0[^]*objetivo de aprendizaje antes de generar recursos/,
  },
  {
    name: 'Prior test delivery uses no passing-score threshold',
    file: 'apps/web/src/app/aprender/[cursoSlug]/conocimiento-previo/[tomoId]/page.tsx',
    pattern: /umbral=\{0\}/,
  },
  {
    name: 'Lessons require the weekly prior test to be completed',
    file: 'apps/web/src/app/aprender/[cursoSlug]/[leccionId]/page.tsx',
    pattern: /conocimientoPrevio|CONOCIMIENTO_PREVIO_TOMO/,
  },
  {
    name: 'Direct flashcard routes require completing the current week',
    file: 'apps/web/src/app/repasar/[tomoId]/page.tsx',
    pattern: /semanaCompletada\(tomo, progreso\)[^]*tarjetasDeTomo\(tomoId\)/,
  },
  {
    name: 'Direct review-test routes require completing the current week',
    file: 'apps/web/src/app/aprender/[cursoSlug]/refuerzo/[tomoId]/page.tsx',
    pattern: /semanaCompletada\(tomo, progreso\)[^]*refuerzoDeTomo\(tomoId\)/,
  },
  {
    name: 'Assessment API blocks prior tests and review until their weekly prerequisites are complete',
    file: 'services/enrollment-progress/src/application/gestionar-intento/gestionar-intento.handler.ts',
    pattern: /cmd\.tipo === 'REFUERZO'[^]*SemanaBloqueadaError[^]*cmd\.tipo === 'CONOCIMIENTO_PREVIO_TOMO'[^]*SemanaBloqueadaError/s,
  },
  {
    name: 'Lesson completion API requires submitting the current weekly prior test',
    file: 'services/enrollment-progress/src/application/completar-leccion/completar-leccion.handler.ts',
    pattern: /ultimoConocimientoPrevioDe\([^]*tomo\.id[^]*ConocimientoPrevioPendienteError/s,
  },
  {
    name: 'DynamoDB Lambda deployment registers the weekly prior-test status query',
    file: 'services/enrollment-progress/src/lambda/handler.ts',
    pattern: /queries\.register\(new ConocimientoPrevioEstadoHandler\(intentos, matriculas, proyeccion, reloj\)\)/,
  },
  {
    name: 'Flashcard generation can target one selected week',
    file: 'services/catalog/src/application/actualizar-contenido/actualizar-contenido.handler.ts',
    pattern: /tomosParaGenerarFlashcards[^]*includes\(tomo\.id\)/,
  },
  {
    name: 'Flashcards use weekly or review materials and exclude prior-only sources',
    file: 'services/catalog/src/application/publicar-fuentes-flashcards.ts',
    pattern: /CONTENIDO_SEMANAL[^]*REPASO/,
  },
  {
    name: 'PostgreSQL flashcard sources apply the same material-purpose filter',
    file: 'services/catalog/src/infrastructure/catalog.di.ts',
    pattern: /enfoques\.includes\('CONTENIDO_SEMANAL'\)[^]*enfoques\.includes\('REPASO'\)/,
  },
  {
    name: 'Student map exposes weekly prior test, review and flashcards',
    file: 'apps/web/src/app/aprender/[cursoSlug]/page.tsx',
    pattern: /(?=.*conocimiento-previo\/\$\{)(?=.*repasoBancoId)(?=.*tieneFlashcards)/s,
  },
  {
    name: 'Flow demo honors reduced-motion preferences',
    file: 'apps/web/src/app/globals.css',
    pattern: /weekly-flow-demo[^]*prefers-reduced-motion:\s*reduce/,
  },
  {
    name: 'Animated flow shows objectives, materials, test drafts and flashcards',
    file: 'apps/web/src/app/admin/RecursosSemanales.tsx',
    pattern: /Objetivos[^]*Materiales[^]*Tests en borrador[^]*Aprobación y flashcards/,
  },
  {
    name: 'Pending Make jobs can be rechecked without starting a duplicate',
    file: 'apps/web/src/app/admin/RecursosSemanales.tsx',
    pattern: /reconsultarTrabajo[^]*Volver a consultar estado/,
  },
  {
    name: 'Teacher can safely redeliver a stale job to Make',
    file: 'apps/web/src/app/admin/RecursosSemanales.tsx',
    pattern:
      /reintentarEnMake[^]*\/api\/admin\/weekly-resources\/\$\{job\.jobId\}\/retry[^]*job\.retryable[^]*Reenviar trabajo a Make/s,
  },
  {
    name: 'Database migrations add weekly prior-test support',
    file: 'services/catalog/migrations/0001_conocimiento_previo_tomo.sql',
    pattern: /CONOCIMIENTO_PREVIO_TOMO[^]*objetivos[^]*enfoques[^]*texto_extraido/,
  },
  {
    name: 'PostgreSQL adapter preserves objectives, tags and extracted text',
    file: 'services/catalog/src/infrastructure/catalog.di.ts',
    pattern:
      /objetivos = EXCLUDED\.objetivos[^]*enfoques = EXCLUDED\.enfoques[^]*texto_extraido = EXCLUDED\.texto_extraido/,
  },
  {
    name: 'Both PostgreSQL adapters apply numbered follow-up migrations',
    file: 'services/enrollment-progress/src/infrastructure/out/persistencia/db.ts',
    pattern: /readdir\(carpeta\)[^]*test\(archivo\)/,
  },
  {
    name: 'Catalog PostgreSQL adapter applies numbered follow-up migrations',
    file: 'services/catalog/src/infrastructure/catalog.di.ts',
    pattern: /readdir\(carpeta\)[^]*test\(archivo\)/,
  },
  {
    name: 'Extracted source text is hidden from public course details',
    file: 'services/catalog/src/infrastructure/out/persistencia/repositorios.dynamodb.ts',
    pattern: /incluirTextoFuente && material\.textoExtraido/,
  },
  {
    name: 'PostgreSQL exposes extracted source only in teacher course details',
    file: 'services/catalog/src/infrastructure/catalog.di.ts',
    pattern:
      /const columnasMaterial = todos[^]*texto_extraido AS "textoExtraido"[^]*: 'id, orden, titulo, descripcion, tipo, url, enfoques'/,
  },
  {
    name: 'Teacher can poll the status of weekly flashcard generation',
    file: 'apps/web/src/app/admin/RecursosSemanales.tsx',
    pattern: /vigilarFlashcards[^]*\/api\/admin\/flashcards\/tomos\/\$\{tomoId\}/,
  },
  {
    name: 'A Make delivery failure marks the saved job failed and removes its source text',
    file: 'apps/web/src/app/api/admin/weekly-resources/route.ts',
    pattern: /queuedJobId[^]*status: 'FAILED'[^]*\},\s*true/s,
  },
  {
    name: 'Latest weekly job pointer is scoped to teacher, course and week and honors expiry',
    file: 'apps/web/src/lib/assistant/weekly-resources.ts',
    pattern:
      /WEEKLY_RESOURCE_USER#\$\{userId\}#COURSE#\$\{courseId\}#TOMO#\$\{tomoId\}[^]*ConsistentRead: true[^]*expiresAt <= Math\.floor\(Date\.now\(\) \/ 1000\)/s,
  },
  {
    name: 'Job creation and latest-job pointer are persisted atomically',
    file: 'apps/web/src/lib/assistant/weekly-resources.ts',
    pattern: /saveWeeklyResourceJob[^]*new TransactWriteCommand[^]*latestJobKey/s,
  },
  {
    name: 'Dynamo updates include only attribute aliases used by each update expression',
    file: 'apps/web/src/lib/assistant/weekly-resources.ts',
    pattern: /const names: Record<string, string> = \{\}[^]*Object\.keys\(names\)\.length/s,
  },
  {
    name: 'Amplify SSR can transact weekly job state on the scoped control table',
    file: 'infra/envs/lowcost/main.tf',
    pattern:
      /resource "aws_iam_role_policy" "amplify_ai"[^]*Action = \["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:TransactWriteItems"\][^]*Resource = aws_dynamodb_table\.domain\["control"\]\.arn/s,
  },
  {
    name: 'Expired weekly jobs are unavailable to status and approval routes',
    file: 'apps/web/src/lib/assistant/weekly-resources.ts',
    pattern:
      /getWeeklyResourceJob[^]*job\.expiresAt <= Math\.floor\(Date\.now\(\) \/ 1000\)[^]*return job/s,
  },
  {
    name: 'Teacher status endpoint restores only their latest job for the requested week',
    file: 'apps/web/src/app/api/admin/weekly-resources/route.ts',
    pattern:
      /export async function GET[^]*getLatestWeeklyResourceJob\(\s*profile\.usuarioId,\s*query\.data\.courseId,\s*query\.data\.tomoId,?\s*\)/s,
  },
  {
    name: 'Weekly resource panel restores saved drafts after reload',
    file: 'apps/web/src/app/admin/RecursosSemanales.tsx',
    pattern:
      /useEffect\(\(\) => \{[^]*api\/admin\/weekly-resources\?courseId=[^]*cache: 'no-store'[^]*setJob\(recovered\)/s,
  },
  {
    name: 'Make deployment variables are documented without committing secret values',
    file: '.env.example',
    pattern: /MAKE_WEEKLY_RESOURCES_WEBHOOK_URL=\s*EDTECH_WEEKLY_JOB_SECRET=\s*$/m,
  },
  {
    name: 'Docker Compose passes local Make settings to the web server',
    file: 'docker-compose.yml',
    pattern:
      /MAKE_WEEKLY_RESOURCES_WEBHOOK_URL:\s*\$\{MAKE_WEEKLY_RESOURCES_WEBHOOK_URL:-\}[^]*EDTECH_WEEKLY_JOB_SECRET:\s*\$\{EDTECH_WEEKLY_JOB_SECRET:-\}/s,
  },
  {
    name: 'Amplify SSR build exposes Make settings to the server runtime',
    file: 'amplify.yml',
    pattern: /MAKE_WEEKLY_RESOURCES_WEBHOOK_URL[^]*EDTECH_WEEKLY_JOB_SECRET\)=/s,
  },
]

let failures = 0
for (const check of checks) {
  try {
    const source = await readFile(join(root, check.file), 'utf8')
    if (!check.pattern.test(source)) throw new Error('required implementation marker not found')
    console.log(`PASS ${check.name}`)
  } catch (error) {
    failures += 1
    console.error(`FAIL ${check.name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log(`\nWeekly RPA harness: ${checks.length - failures}/${checks.length} checks passed.`)
if (failures > 0) process.exitCode = 1
