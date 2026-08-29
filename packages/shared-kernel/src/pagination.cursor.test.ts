import { describe, expect, test } from 'bun:test'
import { codificarCursor, decodificarCursor } from './pagination.cursor'

describe('cursor de paginación', () => {
  test('codifica y decodifica ida y vuelta', () => {
    const cursor = codificarCursor({ k: '2026-08-28T00:00:00Z', id: 'abc' })
    const r = decodificarCursor<{ k: string; id: string }>(cursor)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.id).toBe('abc')
  })

  test('un cursor corrupto devuelve Err, no lanza', () => {
    expect(decodificarCursor('%%%no-base64%%%').ok).toBe(false)
  })
})
