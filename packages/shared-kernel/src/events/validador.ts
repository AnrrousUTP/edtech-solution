import Ajv from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Valida payloads contra los schemas congelados del doc 05 §2. Los schemas son el
// contrato público entre servicios (doc 06 §3.2): se comparte el JSON, no el tipo.
const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)

const dirSchemas = join(dirname(fileURLToPath(import.meta.url)), 'schemas')
let cargados = false
let nombresEventos: string[] = []

const cargarSchemas = (): void => {
  if (cargados) return
  cargados = true
  nombresEventos = readdirSync(dirSchemas)
    .filter(archivo => archivo.endsWith('.json'))
    .sort()
  for (const archivo of nombresEventos) {
    const clave = archivo.replace(/\.json$/, '')
    if (ajv.getSchema(clave)) continue
    const schema = JSON.parse(readFileSync(join(dirSchemas, archivo), 'utf8'))
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
  return nombresEventos.map(archivo => archivo.replace(/\.json$/, ''))
}
