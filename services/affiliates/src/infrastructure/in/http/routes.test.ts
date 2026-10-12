import { describe, expect, test } from 'bun:test'
import { esUuid } from './routes'

describe('identificador de referencia QR', () => {
  test('acepta UUID con guiones usado por los enlaces de afiliado', () => {
    expect(esUuid('047ced9a-170b-441c-8dbe-ddf93d71ef05')).toBe(true)
  })

  test('rechaza referencias que no son UUID', () => {
    expect(esUuid('047ced9a170b441c8dbe')).toBe(false)
    expect(esUuid('no-es-uuid')).toBe(false)
  })
})
