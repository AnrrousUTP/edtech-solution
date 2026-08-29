import { describe, expect, test } from 'bun:test'
import { clientIdPermitido } from './auth.middleware'

// El client_id es la segunda barrera del doc 08 §5: aunque el token esté bien
// firmado por el pool, tiene que venir de un cliente que conocemos.
describe('clientIdPermitido', () => {
  test('sin configuración no revisa nada (emisor local)', () => {
    expect(clientIdPermitido(undefined, 'cualquiera')).toBe(true)
    expect(clientIdPermitido('', 'cualquiera')).toBe(true)
    expect(clientIdPermitido('   ', 'cualquiera')).toBe(true)
  })

  test('con un solo cliente acepta ese y rechaza el resto', () => {
    expect(clientIdPermitido('abc123', 'abc123')).toBe(true)
    expect(clientIdPermitido('abc123', 'otro')).toBe(false)
  })

  test('acepta la lista de dev: cliente web y cliente de pruebas', () => {
    const configurados = '8t4bju1rutbsa6d5s4950ocv5, sm3r98rg412itpo9pua41i4u8'
    expect(clientIdPermitido(configurados, '8t4bju1rutbsa6d5s4950ocv5')).toBe(true)
    expect(clientIdPermitido(configurados, 'sm3r98rg412itpo9pua41i4u8')).toBe(true)
    expect(clientIdPermitido(configurados, 'de-otro-pool')).toBe(false)
  })

  test('un token sin client_id no pasa cuando sí hay lista', () => {
    expect(clientIdPermitido('abc123', undefined)).toBe(false)
    expect(clientIdPermitido('abc123', null)).toBe(false)
  })
})
