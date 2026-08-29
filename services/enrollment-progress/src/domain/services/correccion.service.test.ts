import { describe, expect, test } from 'bun:test'
import { corregir, nivelResultante, type PreguntaCorrecta } from './correccion.service'

const pregunta = (
  id: string,
  correcta: unknown,
  nivel: string | null = null,
): PreguntaCorrecta => ({
  id,
  respuestaCorrecta: correcta,
  puntaje: 1,
  nivel,
})

describe('corregir', () => {
  test('cuenta aciertos y calcula el porcentaje', () => {
    const preguntas = [pregunta('p1', 'a'), pregunta('p2', 'b'), pregunta('p3', 'c')]
    const r = corregir(
      [
        { preguntaId: 'p1', respuesta: 'a' },
        { preguntaId: 'p2', respuesta: 'x' },
        { preguntaId: 'p3', respuesta: 'c' },
      ],
      preguntas,
    )
    expect(r.puntajeObtenido).toBe(2)
    expect(r.porcentaje).toBe(67)
    expect(r.correctas.get('p2')).toBe(false)
  })

  test('una pregunta sin responder cuenta como incorrecta', () => {
    const r = corregir([], [pregunta('p1', 'a')])
    expect(r.porcentaje).toBe(0)
  })

  test('opción múltiple: el orden de las respuestas no importa', () => {
    const r = corregir([{ preguntaId: 'p1', respuesta: ['b', 'a'] }], [pregunta('p1', ['a', 'b'])])
    expect(r.porcentaje).toBe(100)
  })
})

describe('nivelResultante (algoritmo del doc 02 §2)', () => {
  // 2 preguntas por nivel A, B, C
  const banco = (
    aciertos: Record<string, number>,
  ): { preguntas: PreguntaCorrecta[]; correctas: Map<string, boolean> } => {
    const preguntas: PreguntaCorrecta[] = []
    const correctas = new Map<string, boolean>()
    for (const [nivel, n] of Object.entries(aciertos)) {
      for (let i = 0; i < 2; i++) {
        const id = `${nivel}${i}`
        preguntas.push(pregunta(id, 'a', nivel))
        correctas.set(id, i < n)
      }
    }
    return { preguntas, correctas }
  }

  test('sin alcanzar el 60% en ningún nivel → A', () => {
    const { preguntas, correctas } = banco({ A: 0, B: 0, C: 0 })
    expect(nivelResultante(preguntas, correctas)).toBe('A')
  })

  test('aprueba A y B pero falla C → B', () => {
    const { preguntas, correctas } = banco({ A: 2, B: 2, C: 0 })
    expect(nivelResultante(preguntas, correctas)).toBe('B')
  })

  test('aprueba todos → el nivel más alto', () => {
    const { preguntas, correctas } = banco({ A: 2, B: 2, C: 2 })
    expect(nivelResultante(preguntas, correctas)).toBe('C')
  })

  test('falla un nivel intermedio: no salta al siguiente aunque lo apruebe', () => {
    const { preguntas, correctas } = banco({ A: 2, B: 0, C: 2 })
    expect(nivelResultante(preguntas, correctas)).toBe('A')
  })
})
