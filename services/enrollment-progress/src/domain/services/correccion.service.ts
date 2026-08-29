// Servicios de dominio puros: corrección de respuestas y algoritmo de
// nivelación (doc 02 §2). Sin mocks, sin I/O.
export type PreguntaCorrecta = {
  id: string
  respuestaCorrecta: unknown
  puntaje: number
  nivel: string | null
}

export type RespuestaDada = { preguntaId: string; respuesta: unknown }

export type ResultadoCorreccion = {
  puntajeObtenido: number
  puntajeTotal: number
  porcentaje: number
  correctas: Map<string, boolean>
}

const normalizar = (v: unknown): string => {
  if (Array.isArray(v)) return JSON.stringify([...v].map(String).sort())
  return JSON.stringify(v)
}

export const corregir = (
  respuestas: RespuestaDada[],
  preguntas: PreguntaCorrecta[],
): ResultadoCorreccion => {
  const porPregunta = new Map(respuestas.map(r => [r.preguntaId, r.respuesta]))
  const correctas = new Map<string, boolean>()
  let obtenido = 0
  let total = 0
  for (const p of preguntas) {
    total += p.puntaje
    const dada = porPregunta.get(p.id)
    const acierto = dada !== undefined && normalizar(dada) === normalizar(p.respuestaCorrecta)
    correctas.set(p.id, acierto)
    if (acierto) obtenido += p.puntaje
  }
  return {
    puntajeObtenido: obtenido,
    puntajeTotal: total,
    porcentaje: total === 0 ? 0 : Math.round((obtenido / total) * 100),
    correctas,
  }
}

const NIVELES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'] as const

/** Nivel más alto en el que el estudiante acertó ≥60% de las preguntas de ese
 *  nivel y de todos los anteriores; si no alcanza en ninguno → A (doc 02 §2).
 *  Un nivel sin preguntas no bloquea (se considera cumplido por vacuidad). */
export const nivelResultante = (
  preguntas: PreguntaCorrecta[],
  correctas: Map<string, boolean>,
): string => {
  const porNivel = new Map<string, { total: number; aciertos: number }>()
  for (const p of preguntas) {
    if (!p.nivel) continue
    const stats = porNivel.get(p.nivel) ?? { total: 0, aciertos: 0 }
    stats.total += 1
    if (correctas.get(p.id)) stats.aciertos += 1
    porNivel.set(p.nivel, stats)
  }

  let resultado = 'A'
  for (const nivel of NIVELES) {
    const stats = porNivel.get(nivel)
    if (stats && stats.aciertos / stats.total < 0.6) break
    if (stats) resultado = nivel
  }
  return resultado
}
