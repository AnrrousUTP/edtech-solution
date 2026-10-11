import { expect, test } from 'bun:test'
import { validarMensaje } from './configuracion.vo'
test('el terminal limita el texto promocional sin interpretar HTML', () => {
  expect(validarMensaje(' Aprende con EdTech ')).toBe('Aprende con EdTech')
  expect(() => validarMensaje(' ')).toThrow()
  expect(() => validarMensaje('x'.repeat(161))).toThrow()
})
