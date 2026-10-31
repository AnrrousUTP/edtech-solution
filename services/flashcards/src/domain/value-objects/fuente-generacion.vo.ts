import { Err, Ok, type Result } from '@edtech/shared-kernel'
import { GeneracionError } from '../module.errors'

export type ContextoFuente = {
  cursoTitulo?: string
  cursoTecnologia?: string
  nivelMin?: string
  nivelMax?: string
  tomoTitulo?: string
}

export type FuenteGeneracion = {
  titulo: string
  contenido: string
  contexto?: ContextoFuente
}

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)

/** Convierte el formato estructurado del catálogo; conserva fuentes antiguas como texto plano. */
export const leerFuenteGeneracion = (
  bruto: string,
  tituloFallback: string,
): Result<FuenteGeneracion, GeneracionError> => {
  let fuente: unknown
  try {
    fuente = JSON.parse(bruto)
  } catch {
    return Err(new GeneracionError('La fuente no tiene formato JSON estructurado'))
  }
  if (!esObjeto(fuente)) return Err(new GeneracionError('La fuente no tiene formato estructurado'))

  const contexto = esObjeto(fuente.contexto) ? (fuente.contexto as ContextoFuente) : undefined
  const bloques = Array.isArray(fuente.bloques)
    ? fuente.bloques.flatMap(bloque => {
        if (!esObjeto(bloque) || !esObjeto(bloque.contenido)) return []
        return Object.values(bloque.contenido).filter(
          (valor): valor is string => typeof valor === 'string',
        )
      })
    : []
  const contenido = [...(typeof fuente.texto === 'string' ? [fuente.texto] : []), ...bloques]
    .map(texto => texto.trim())
    .filter(Boolean)
    .join('\n\n')

  return Ok({
    titulo: typeof fuente.titulo === 'string' ? fuente.titulo : tituloFallback,
    contenido: contenido || bruto,
    ...(contexto ? { contexto } : {}),
  })
}
