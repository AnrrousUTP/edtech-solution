import Ajv from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { Glob } from 'bun'
import { join } from 'node:path'

// Valida payloads contra los schemas congelados del doc 05 §2. Los schemas son el
// contrato público entre servicios (doc 06 §3.2): se comparte el JSON, no el tipo.
const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)

const dirSchemas = join(import.meta.dir, 'schemas')
let cargados = false

const cargarSchemas = (): void => {
  if (cargados) return
  cargados = true
  const glob = new Glob('*.json')
  for (const archivo of glob.scanSync(dirSchemas)) {
    const clave = archivo.replace(/\.json$/, '')
    if (ajv.getSchema(clave)) continue
    const schema = require(join(dirSchemas, archivo))
    ajv.addSchema(schema, clave)
  }
}

export type ResultadoValidacion = { valido: true } | { valido: false; errores: string[] }

export const validarContra = (
  eventType: string,
  payload: Record<string, unknown>,
): ResultadoValidacion => {
  cargarSchemas()
  const validar = ajv.getSchema(eventType)
  if (!validar) return { valido: false, errores: [`No existe schema para ${eventType}`] }
  if (validar(payload)) return { valido: true }
  return {
    valido: false,
    errores: (validar.errors ?? []).map(e => `${e.instancePath || '/'} ${e.message ?? ''}`),
  }
}

export const tiposDeEventoConocidos = (): string[] => {
  cargarSchemas()
  const glob = new Glob('*.json')
  return [...glob.scanSync(dirSchemas)].map(a => a.replace(/\.json$/, '')).sort()
}
