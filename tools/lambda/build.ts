import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { zipSync } from 'fflate'

const supportedDomains = new Set([
  'affiliates',
  'catalog',
  'enrollment-progress',
  'identity-access',
  'flashcards',
  'iot-terminals',
  'payments',
  'outbox',
])
const domain = process.argv[2]
if (!domain || !supportedDomains.has(domain)) {
  console.error(
    `Indica un dominio con handler Lambda verificado: ${[...supportedDomains].join(', ')}`,
  )
  process.exit(2)
}

const root = process.cwd()
const entrypoint =
  domain === 'outbox'
    ? resolve(root, 'packages/shared-kernel/src/aws/dynamodb-outbox.publisher.ts')
    : resolve(root, `services/${domain}/src/lambda/handler.ts`)
const outputDirectory = resolve(root, `.local/lambda/${domain}`)
const result = await Bun.build({
  entrypoints: [entrypoint],
  outdir: outputDirectory,
  target: 'node',
  format: 'esm',
  naming: { entry: 'handler.mjs' },
  minify: true,
  sourcemap: 'none',
  write: false,
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
const handler = result.outputs.find(output => output.path.endsWith('handler.mjs'))
if (!handler) throw new Error('Bun no produjo handler.mjs')

const bytes = new Uint8Array(await handler.arrayBuffer())
const sha256 = createHash('sha256').update(bytes).digest('hex')
const git = Bun.which('git')
let revision =
  process.env.SOURCE_REVISION ??
  (git
    ? Bun.spawnSync([git, 'rev-parse', 'HEAD'], { cwd: root }).stdout.toString().trim()
    : 'working-tree')
if (!process.env.SOURCE_REVISION && git) {
  const dirty = Bun.spawnSync([git, 'status', '--porcelain'], { cwd: root })
    .stdout.toString()
    .trim()
  if (dirty) revision += '-dirty'
}
const manifest = JSON.stringify(
  { domain, handler: 'handler.handler', runtime: 'nodejs22.x', revision, sha256 },
  null,
  2,
)
const fixedMtime = new Date('1980-01-01T00:00:00.000Z')
const zipFiles: Parameters<typeof zipSync>[0] = {
  'handler.mjs': [bytes, { level: 9, mtime: fixedMtime, os: 3, attrs: 0o644 << 16 }],
  'manifest.json': [
    new TextEncoder().encode(manifest),
    { level: 9, mtime: fixedMtime, os: 3, attrs: 0o644 << 16 },
  ],
}
const schemasDirectory = resolve(root, 'packages/shared-kernel/src/events/schemas')
for (const schema of await readdir(schemasDirectory)) {
  if (!schema.endsWith('.json')) continue
  zipFiles[`schemas/${schema}`] = [
    new Uint8Array(await readFile(resolve(schemasDirectory, schema))),
    { level: 9, mtime: fixedMtime, os: 3, attrs: 0o644 << 16 },
  ]
}
const zip = zipSync(zipFiles)
await mkdir(outputDirectory, { recursive: true })
const artifact = resolve(outputDirectory, `${domain}.zip`)
await writeFile(artifact, zip)
console.log(JSON.stringify({ artifact, bytes: zip.byteLength, handlerSha256: sha256, revision }))
