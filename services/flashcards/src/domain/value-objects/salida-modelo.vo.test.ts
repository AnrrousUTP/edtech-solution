import { describe, expect, test } from 'bun:test'
import { extraerTarjetas, validarTarjetas } from './salida-modelo.vo'

const tarjetasValidas = (n: number): { anverso: string; reverso: string }[] =>
  Array.from({ length: n }, (_, i) => ({ anverso: `Pregunta ${i}`, reverso: `Respuesta ${i}` }))

describe('validarTarjetas (doc 10 §4)', () => {
  test('acepta un lote válido', () => {
    const r = validarTarjetas(tarjetasValidas(10))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toHaveLength(10)
  })

  test('rechaza menos de 8 tarjetas válidas', () => {
    expect(validarTarjetas(tarjetasValidas(5)).ok).toBe(false)
  })

  test('recorta a 20 como máximo', () => {
    const r = validarTarjetas(tarjetasValidas(30))
    if (r.ok) expect(r.value).toHaveLength(20)
  })

  test('deduplica por anverso normalizado (tildes y mayúsculas)', () => {
    const conDuplicados = [
      ...tarjetasValidas(9),
      { anverso: 'PREGUNTA 0', reverso: 'otra respuesta' },
      { anverso: 'pregunta 0', reverso: 'y otra' },
    ]
    const r = validarTarjetas(conDuplicados)
    if (r.ok) expect(r.value).toHaveLength(9)
  })

  test('descarta tarjetas vacías y demasiado largas', () => {
    const mezcla = [
      ...tarjetasValidas(8),
      { anverso: '   ', reverso: 'x' },
      { anverso: 'x', reverso: '' },
      { anverso: 'a'.repeat(200), reverso: 'ok' },
      { anverso: 'ok', reverso: 'b'.repeat(500) },
    ]
    const r = validarTarjetas(mezcla)
    if (r.ok) expect(r.value).toHaveLength(8)
  })

  test('rechaza una salida que no es un array', () => {
    expect(validarTarjetas({ tarjetas: [] }).ok).toBe(false)
    expect(validarTarjetas(null).ok).toBe(false)
  })
})

describe('extraerTarjetas', () => {
  test('extrae el JSON limpio', () => {
    const r = extraerTarjetas('{"tarjetas":[{"anverso":"a","reverso":"b"}]}')
    expect(r.ok).toBe(true)
  })

  test('tolera texto alrededor del JSON', () => {
    const r = extraerTarjetas(
      'Claro, aquí tienes:\n{"tarjetas":[{"anverso":"a","reverso":"b"}]}\n¡Listo!',
    )
    expect(r.ok).toBe(true)
  })

  test('tolera un bloque de código markdown', () => {
    const r = extraerTarjetas('```json\n{"tarjetas":[{"anverso":"a","reverso":"b"}]}\n```')
    expect(r.ok).toBe(true)
  })

  test('falla si no hay JSON con la clave tarjetas', () => {
    expect(extraerTarjetas('no puedo ayudarte con eso').ok).toBe(false)
    expect(extraerTarjetas('{"otra":"cosa"}').ok).toBe(false)
  })
})
