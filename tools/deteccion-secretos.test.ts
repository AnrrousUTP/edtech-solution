import { describe, expect, test } from 'bun:test'
import { buscarSecretos } from './deteccion-secretos'

// Una comprobación de seguridad que nadie probó puede estar dando verde sin mirar
// nada — que es exactamente lo que pasaba con el grep original de I-12. Este test
// existe para que el detector tenga que demostrar que detecta.
describe('detección de secretos (I-12)', () => {
  test('encuentra un secreto de PayPal en un .env commiteado', () => {
    const h = buscarSecretos('+PAYPAL_CLIENT_SECRET=EJ7xK9mQ2vLp4nR8sT1wY6zA3bC5dF0gH')
    expect(h.length).toBeGreaterThan(0)
  })

  test('encuentra un client_secret asignado en un .tf', () => {
    const h = buscarSecretos('  client_secret = "AbCdEf1234567890XyZw"')
    expect(h[0]?.tipo).toBe('asignacion')
  })

  test('encuentra una access key de AWS', () => {
    const h = buscarSecretos('export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE')
    expect(h.some(x => x.tipo === 'token')).toBe(true)
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
    expect(buscarSecretos("const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'")).toEqual([])
  })

  test('no se queja del ID único de IAM que quedó en el state de bootstrap', () => {
    expect(buscarSecretos('"user_id": "AIDAQWFJXQLGQAKHHDISB"')).toEqual([])
  })

  test('no revela el secreto encontrado en el propio hallazgo', () => {
    const h = buscarSecretos('export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE')
    const token = h.find(x => x.tipo === 'token')
    expect(token?.muestra).not.toContain('EXAMPLE')
  })
})
