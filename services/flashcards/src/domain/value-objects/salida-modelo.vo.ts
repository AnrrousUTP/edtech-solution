import { Err, Ok, type Result } from '@edtech/shared-kernel'
import { SalidaInvalidaError } from '../module.errors'

// Validación de la salida del modelo ANTES de tocar la base (doc 10 §4).
const MIN_TARJETAS = 8
const MAX_TARJETAS = 20
const MAX_ANVERSO = 120
const MAX_REVERSO = 400

const normalizar = (t: string): string =>
  t.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')

export type TarjetaValida = { anverso: string; reverso: string }

/** Valida shape y límites, deduplica por anverso normalizado y descarta vacías.
 *  Es una función pura del dominio: el mismo criterio para el fake y para Bedrock. */
export const validarTarjetas = (crudas: unknown): Result<TarjetaValida[], SalidaInvalidaError> => {
  if (!Array.isArray(crudas)) return Err(new SalidaInvalidaError('la salida no es un array'))

  const vistas = new Set<string>()
  const validas: TarjetaValida[] = []

  for (const cruda of crudas) {
    if (typeof cruda !== 'object' || cruda === null) continue
    const { anverso, reverso } = cruda as { anverso?: unknown; reverso?: unknown }
    if (typeof anverso !== 'string' || typeof reverso !== 'string') continue

    const a = anverso.trim()
    const r = reverso.trim()
    if (!a || !r) continue // descarta vacías
    if (a.length > MAX_ANVERSO || r.length > MAX_REVERSO) continue

    const clave = normalizar(a)
    if (vistas.has(clave)) continue // deduplicación
    vistas.add(clave)
    validas.push({ anverso: a, reverso: r })
  }

  if (validas.length < MIN_TARJETAS)
    return Err(
      new SalidaInvalidaError(
        `solo ${validas.length} tarjetas válidas, se esperan ${MIN_TARJETAS}+`,
      ),
    )
  return Ok(validas.slice(0, MAX_TARJETAS))
}

/** Extrae el JSON de la respuesta del modelo, tolerando el envoltorio de texto
 *  o los bloques ```json que a veces acompañan la salida. */
export const extraerTarjetas = (texto: string): Result<unknown, SalidaInvalidaError> => {
  const limpio = texto.replace(/^[\s\S]*?```(?:json)?/, '').replace(/```[\s\S]*$/, '') || texto
  const candidatos = [texto, limpio]
  for (const candidato of candidatos) {
    const inicio = candidato.indexOf('{')
    const fin = candidato.lastIndexOf('}')
    if (inicio === -1 || fin <= inicio) continue
    try {
      const parseado = JSON.parse(candidato.slice(inicio, fin + 1)) as { tarjetas?: unknown }
      if (parseado.tarjetas !== undefined) return Ok(parseado.tarjetas)
    } catch {
      continue
    }
  }
  return Err(new SalidaInvalidaError('no se encontró un JSON con la clave "tarjetas"'))
}
