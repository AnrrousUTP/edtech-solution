import { describe, expect, test } from 'bun:test'
import { buscarSecretos } from './deteccion-secretos'

// Una comprobación de seguridad que nadie probó puede estar dando verde sin mirar
// nada — que es exactamente lo que pasaba con el grep original de I-12. Este test
// existe para que el detector tenga que demostrar que detecta.
//
// Los valores de mentira se ARMAN acá en vez de escribirse enteros: si estuvieran
// literales, el propio detector los encontraría al recorrer el historial y I-12
// saldría en rojo por su archivo de pruebas. (Pasó: la primera versión de este
// test hizo fallar el chequeo, que es la mejor demostración de que funciona.)
const falso = (...partes: string[]): string => partes.join('')

describe('detección de secretos (I-12)', () => {
  test('encuentra un secreto de PayPal en un .env commiteado', () => {
    const linea = falso('+PAYPAL_CLIENT_SECRET=', 'EJ7xK9mQ2vLp4nR8', 'sT1wY6zA3bC5dF0gH')
    expect(buscarSecretos(linea).length).toBeGreaterThan(0)
  })

  test('encuentra un client_secret asignado en un .tf', () => {
    const linea = falso('  client_secret = "', 'AbCdEf1234', '567890XyZw', '"')
    expect(buscarSecretos(linea)[0]?.tipo).toBe('asignacion')
  })

  test('encuentra una access key de AWS', () => {
    const linea = falso('export AWS_ACCESS_KEY_ID=', 'AKIA', 'IOSFODNN7', 'EXAMPLE')
    expect(buscarSecretos(linea).some(x => x.tipo === 'token')).toBe(true)
  })

  test('no se queja de la plantilla sin rellenar', () => {
    expect(buscarSecretos('PAYPAL_CLIENT_SECRET=<PEGAR_AQUI>')).toEqual([])
  })

  test('no se queja de leer el secreto de Secrets Manager', () => {
    const linea =
      '    client_secret = jsondecode(data.aws_secretsmanager_secret_version.google[0].secret_string).client_secret'
    expect(buscarSecretos(linea)).toEqual([])
  })

  test('no se queja del NOMBRE de un secreto en una task definition', () => {
    expect(buscarSecretos('  PAYPAL_SECRET_NAME = "edtech/dev/paypal"')).toEqual([])
  })

  test('no se queja del alfabeto del código de certificado (A-29)', () => {
    const linea = falso("const ALFABETO = '", 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', "'")
    expect(buscarSecretos(linea)).toEqual([])
  })

  test('no se queja del ID único de IAM que quedó en el state de bootstrap', () => {
    const linea = falso('"user_id": "', 'AIDA', 'QWFJXQLGQAKHHDISB', '"')
    expect(buscarSecretos(linea)).toEqual([])
  })

  test('no revela el secreto encontrado en el propio hallazgo', () => {
    const linea = falso('export AWS_ACCESS_KEY_ID=', 'AKIA', 'IOSFODNN7', 'EXAMPLE')
    const token = buscarSecretos(linea).find(x => x.tipo === 'token')
    expect(token?.muestra).not.toContain('EXAMPLE')
  })
})
