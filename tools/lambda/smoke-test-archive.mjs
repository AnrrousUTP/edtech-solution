import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { unzipSync } from 'fflate'

const domain = process.argv[2]
if (
  ![
    'affiliates',
    'catalog',
    'enrollment-progress',
    'identity-access',
    'flashcards',
    'iot-terminals',
    'payments',
    'outbox',
  ].includes(domain)
) {
  throw new Error('Indica un dominio Lambda soportado')
}
const archivePath = `.local/lambda/${domain}/${domain}.zip`
const files = unzipSync(new Uint8Array(await readFile(archivePath)))
assert.ok(files['handler.mjs'], 'El archivo handler.mjs debe estar en la raíz del ZIP')
assert.ok(files['manifest.json'], 'El ZIP debe contener su manifest')
const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']))
assert.equal(manifest.domain, domain)
assert.equal(manifest.handler, 'handler.handler')
assert.equal(manifest.runtime, 'nodejs22.x')
assert.match(manifest.sha256, /^[a-f0-9]{64}$/)
assert.ok(
  Object.keys(files).some(name => name.startsWith('schemas/')),
  'Faltan contratos de eventos',
)
assert.ok(
  !Object.keys(files).some(name => name.endsWith('/')),
  'El ZIP contiene entradas de directorio malformadas',
)
console.log(`${domain} Lambda archive: manifest y archivos de raíz correctos`)
