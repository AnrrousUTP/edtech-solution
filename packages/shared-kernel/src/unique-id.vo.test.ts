import { describe, expect, test } from 'bun:test'
import { isErr, isOk } from './result.type'
import { UniqueId } from './unique-id.vo'

describe('UniqueId', () => {
  test('nuevo() genera un UUID válido', () => {
    const id = UniqueId.nuevo()
    expect(UniqueId.intentar(id.valor).ok).toBe(true)
  })

  test('desde() acepta un UUID y normaliza a minúsculas', () => {
    const id = UniqueId.desde('9B2E7A10-1111-4222-8333-444455556666')
    expect(id.valor).toBe('9b2e7a10-1111-4222-8333-444455556666')
  })

  test('desde() lanza ante un valor que no es UUID', () => {
    expect(() => UniqueId.desde('no-es-uuid')).toThrow()
  })

  test('intentar() devuelve Err sin lanzar', () => {
    const r = UniqueId.intentar('nope')
    expect(isErr(r)).toBe(true)
  })

  test('equals compara por valor', () => {
    const a = UniqueId.nuevo()
    const b = UniqueId.desde(a.valor)
    expect(a.equals(b)).toBe(true)
  })

  test('intentar con uuid válido devuelve Ok', () => {
    const r = UniqueId.intentar(crypto.randomUUID())
    expect(isOk(r)).toBe(true)
  })
})
