import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'

type Check = { name: string; status: 'PASS' | 'BLOCK' | 'UNKNOWN' | 'MANUAL'; detail: string }

const root = process.cwd()
const region = process.env.AWS_REGION ?? 'us-east-1'
const profile = process.env.AWS_PROFILE ?? 'edtech'
const appId = process.env.AMPLIFY_APP_ID ?? 'ddgj3exz5re93'
const roleName = process.env.EDTECH_AMPLIFY_COMPUTE_ROLE ?? 'edtech-lowcost-amplify-compute'
const checks: Check[] = []

const add = (name: string, status: Check['status'], detail: string): void => {
  checks.push({ name, status, detail })
}

const quotePowerShell = (value: string): string => `'${value.replaceAll("'", "''")}'`

const awsEnvironment = (): Record<string, string> => {
  const environment = { ...process.env } as Record<string, string>
  for (const name of Object.keys(environment))
    if (/^AWS_ENDPOINT_URL(?:_|$)/i.test(name)) delete environment[name]
  return environment
}

const runAws = (args: string[]): { ok: boolean; stdout: string } => {
  const executable = Bun.which('aws')
  if (!executable) return { ok: false, stdout: '' }
  const shell = process.platform === 'win32' ? (Bun.which('pwsh') ?? Bun.which('powershell')) : null
  const env = awsEnvironment()
  if (!shell) {
    try {
      const result = Bun.spawnSync([executable, ...args], { cwd: root, env })
      return { ok: result.exitCode === 0, stdout: result.stdout.toString().trim() }
    } catch {
      return { ok: false, stdout: '' }
    }
  }
  const script = `$awsPath = ${quotePowerShell(executable)}; $awsArgs = @(${args.map(quotePowerShell).join(',')}); & $awsPath @awsArgs; $awsExit = $LASTEXITCODE; [Console]::Out.WriteLine('__WEEKLY_RPA_AWS_EXIT__=' + $awsExit); exit 0`
  try {
    const result = Bun.spawnSync([shell, '-NoProfile', '-Command', script], { cwd: root, env })
    const output = result.stdout.toString()
    const marker = /(?:^|\r?\n)__WEEKLY_RPA_AWS_EXIT__=(\d+)\s*$/.exec(output)
    if (result.exitCode !== 0 || !marker) return { ok: false, stdout: '' }
    return { ok: Number(marker[1]) === 0, stdout: output.slice(0, marker.index).trim() }
  } catch {
    return { ok: false, stdout: '' }
  }
}

const readDotEnv = (source: string): Record<string, string> => {
  const values: Record<string, string> = {}
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!match) continue
    let value = match[2]
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1)
    else value = value.replace(/\s+#.*$/, '').trim()
    values[match[1]] = value
  }
  return values
}

const parseJson = <T>(source: string): T | null => {
  try {
    return JSON.parse(source) as T
  } catch {
    return null
  }
}

const readLocalConfiguration = async (): Promise<boolean> => {
  try {
    const values = readDotEnv(await readFile(join(root, '.env'), 'utf8'))
    const webhook = new URL(values.MAKE_WEEKLY_RESOURCES_WEBHOOK_URL ?? '')
    const secret = values.EDTECH_WEEKLY_JOB_SECRET ?? ''
    const validWebhook =
      webhook.protocol === 'https:' &&
      /^hook\.[a-z0-9-]+\.make\.com$/i.test(webhook.hostname) &&
      !webhook.username &&
      !webhook.password &&
      webhook.pathname.split('/').filter(Boolean).length > 0
    const validSecret = Buffer.byteLength(secret, 'utf8') >= 32
    const ready = validWebhook && validSecret
    add(
      'Local .env configuration',
      ready ? 'PASS' : 'BLOCK',
      ready
        ? 'Make URL and signing secret are present and valid; values hidden.'
        : 'Make URL or signing secret is missing or invalid; values hidden.',
    )
    return ready
  } catch {
    add('Local .env configuration', 'BLOCK', 'Could not read the local .env file; values hidden.')
    return false
  }
}

const readLambdaArtifacts = async (expectedHead: string): Promise<boolean> => {
  let ready = true
  for (const domain of ['catalog', 'enrollment-progress'] as const) {
    try {
      const archive = await readFile(join(root, '.local', 'lambda', domain, `${domain}.zip`))
      const entries = unzipSync(archive)
      const manifest = parseJson<{
        domain?: string
        handler?: string
        runtime?: string
        revision?: string
        sha256?: string
      }>(strFromU8(entries['manifest.json'] ?? new Uint8Array()))
      const handler = entries['handler.mjs']
      const hash = handler ? createHash('sha256').update(handler).digest('hex') : ''
      const valid = Boolean(
        manifest?.domain === domain &&
          manifest.handler === 'handler.handler' &&
          manifest.runtime === 'nodejs22.x' &&
          (manifest.revision === expectedHead || manifest.revision === `${expectedHead}-dirty`) &&
          manifest.sha256 === hash &&
          handler &&
          strFromU8(handler).includes('CONOCIMIENTO_PREVIO_TOMO'),
      )
      if (!valid) ready = false
      add(
        `${domain} Lambda ZIP`,
        valid ? 'PASS' : 'BLOCK',
        valid ? 'Manifest, handler marker and SHA-256 are valid.' : 'ZIP or manifest is missing or stale.',
      )
    } catch {
      ready = false
      add(`${domain} Lambda ZIP`, 'BLOCK', 'ZIP could not be read.')
    }
  }
  return ready
}

const awsArgs = ['--profile', profile, '--region', region]

const checkAmplifyEnvironment = (): { ready: boolean; controlTable?: string } => {
  const result = runAws([
    'amplify',
    'get-branch',
    '--app-id',
    appId,
    '--branch-name',
    'main',
    ...awsArgs,
    '--query',
    'keys(branch.environmentVariables)',
    '--output',
    'json',
  ])
  if (!result.ok) {
    add('Amplify main Make variables', 'UNKNOWN', 'AWS CLI/profile could not read the branch.')
    return { ready: false }
  }
  const names = parseJson<string[]>(result.stdout) ?? []
  const present =
    names.includes('MAKE_WEEKLY_RESOURCES_WEBHOOK_URL') &&
    names.includes('EDTECH_WEEKLY_JOB_SECRET')
  add(
    'Amplify main Make variables',
    present ? 'PASS' : 'BLOCK',
    present ? 'Both required variable names exist; values were not read.' : 'One or both variable names are absent.',
  )
  const table = runAws([
    'amplify',
    'get-branch',
    '--app-id',
    appId,
    '--branch-name',
    'main',
    ...awsArgs,
    '--query',
    'branch.environmentVariables.EDTECH_CONTROL_TABLE',
    '--output',
    'text',
  ])
  return { ready: present, controlTable: table.ok && table.stdout !== 'None' ? table.stdout : undefined }
}

const checkPublishedSource = (head: string, rpaChanges: string): boolean => {
  const latest = runAws([
    'amplify',
    'list-jobs',
    '--app-id',
    appId,
    '--branch-name',
    'main',
    '--max-results',
    '1',
    ...awsArgs,
    '--query',
    'jobSummaries[0].{status:status,commit:commitId}',
    '--output',
    'json',
  ])
  if (!latest.ok) {
    add('RPA source published to Amplify', 'UNKNOWN', 'AWS CLI/profile could not read the latest build.')
    return false
  }
  const job = parseJson<{ status?: string; commit?: string }>(latest.stdout)
  const published = job?.status === 'SUCCEED' && job.commit === head && !rpaChanges
  add(
    'RPA source published to Amplify',
    published ? 'PASS' : 'BLOCK',
    published
      ? 'Latest successful Amplify build matches HEAD and RPA paths are clean.'
      : 'Latest build does not include the current RPA worktree changes.',
  )
  return published
}

const checkDynamoPermission = (controlTable?: string): boolean => {
  if (!controlTable) {
    add('Amplify DynamoDB transaction permission', 'UNKNOWN', 'Control table name is unavailable.')
    return false
  }
  const identity = runAws([
    'sts',
    'get-caller-identity',
    ...awsArgs,
    '--query',
    'Account',
    '--output',
    'text',
  ])
  if (!identity.ok || !/^\d{12}$/.test(identity.stdout)) {
    add('Amplify DynamoDB transaction permission', 'UNKNOWN', 'AWS account identity is unavailable.')
    return false
  }
  const roleArn = `arn:aws:iam::${identity.stdout}:role/${roleName}`
  const tableArn = `arn:aws:dynamodb:${region}:${identity.stdout}:table/${controlTable}`
  const decision = runAws([
    'iam',
    'simulate-principal-policy',
    '--policy-source-arn',
    roleArn,
    '--action-names',
    'dynamodb:TransactWriteItems',
    '--resource-arns',
    tableArn,
    ...awsArgs,
    '--query',
    'EvaluationResults[0].EvalDecision',
    '--output',
    'text',
  ])
  if (!decision.ok) {
    add('Amplify DynamoDB transaction permission', 'UNKNOWN', 'IAM policy simulation is unavailable.')
    return false
  }
  const allowed = decision.stdout.toLowerCase() === 'allowed'
  add(
    'Amplify DynamoDB transaction permission',
    allowed ? 'PASS' : 'BLOCK',
    allowed ? 'TransactWriteItems is allowed on the control table.' : 'TransactWriteItems is not allowed on the control table.',
  )
  return allowed
}

const git = Bun.which('git')
const headResult = git ? Bun.spawnSync([git, 'rev-parse', 'HEAD'], { cwd: root }) : null
const head = headResult?.exitCode === 0 ? headResult.stdout.toString().trim() : ''
const statusResult = git
  ? Bun.spawnSync(
      [
        git,
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
        '--',
        'package.json',
        '.env.example',
        'amplify.yml',
        'docker-compose.yml',
        'infra/envs/lowcost/main.tf',
        'apps/web/src',
        'services/catalog/src',
        'services/catalog/migrations',
        'services/enrollment-progress/src',
        'services/enrollment-progress/migrations',
        'tools/weekly-rpa-harness.ts',
        'tools/weekly-rpa-preflight.ts',
        'docs/rpa',
        'docs/diagramas/rpa-bocetos',
      ],
      { cwd: root },
    )
  : null
const rpaChanges = statusResult?.stdout.toString().trim() ?? 'git-unavailable'
if (!head) add('Git source revision', 'UNKNOWN', 'Could not read the current commit.')
else
  add(
    'RPA source worktree',
    rpaChanges ? 'BLOCK' : 'PASS',
    rpaChanges ? 'RPA-related source changes are not committed.' : 'RPA-related source paths are clean.',
  )

const localConfigurationReady = await readLocalConfiguration()
const lambdaArtifactsReady = await readLambdaArtifacts(head)
const localReady = localConfigurationReady && lambdaArtifactsReady
const branch = checkAmplifyEnvironment()
const published = head ? checkPublishedSource(head, rpaChanges) : false
const permission = checkDynamoPermission(branch.controlTable)
const releaseGatesReady = localReady && branch.ready && published && permission

console.log('Weekly RPA release preflight (read-only)')
for (const check of checks) console.log(`[${check.status}] ${check.name}: ${check.detail}`)
console.log(
  `\nAutomated release gates: ${releaseGatesReady ? 'PASS' : 'NOT READY'}. Confirm the Make scenario is active and its latest HTTP run succeeds before the end-to-end demonstration.`,
)
if (!releaseGatesReady) process.exitCode = 1
