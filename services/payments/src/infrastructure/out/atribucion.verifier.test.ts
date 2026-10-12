import { beforeAll, describe, expect, test } from 'bun:test'
import { generateKeyPair, exportSPKI, SignJWT } from 'jose'
import { VerificadorEd25519 } from './atribucion.verifier'
let signer: Awaited<ReturnType<typeof generateKeyPair>>['privateKey']
let verifier: VerificadorEd25519
const buyer = '00000000-0000-4000-8000-000000000010'
const affiliate = '00000000-0000-4000-8000-000000000020'
const datos = {
  afiliadoId: '00000000-0000-4000-8000-000000000030',
  afiliadoUsuarioId: affiliate,
  visitaId: '00000000-0000-4000-8000-000000000040',
  refId: '047ced9a-170b-441c-8dbe-ddf93d71ef05',
  compradorId: buyer,
  politica: 'ultimo-referido-30d-v1',
  tasaBps: 500,
}
beforeAll(async () => {
  const keys = await generateKeyPair('EdDSA')
  signer = keys.privateKey
  verifier = new VerificadorEd25519(await exportSPKI(keys.publicKey))
})
const prueba = (changes: Record<string, unknown> = {}, exp = '5m') =>
  new SignJWT({ ...datos, ...changes })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(buyer)
    .setIssuer('edtech-referrals')
    .setAudience('payments')
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(signer)
describe('prueba de atribución', () => {
  test('acepta firma válida y vinculada al comprador', async () =>
    expect((await verifier.verificar(await prueba(), buyer)).ok).toBe(true))
  test('rechaza otra cuenta, expiración y autorreferido', async () => {
    expect((await verifier.verificar(await prueba(), affiliate)).ok).toBe(false)
    expect((await verifier.verificar(await prueba({}, '-1m'), buyer)).ok).toBe(false)
    expect((await verifier.verificar(await prueba({ afiliadoUsuarioId: buyer }), buyer)).ok).toBe(
      false,
    )
  })
  test('rechaza porcentaje manipulado y firma alterada', async () => {
    expect((await verifier.verificar(await prueba({ tasaBps: 1000 }), buyer)).ok).toBe(false)
    const valid = await prueba(),
      parts = valid.split('.')
    parts[1] = Buffer.from(JSON.stringify({ ...datos, tasaBps: 1000 })).toString('base64url')
    expect((await verifier.verificar(parts.join('.'), buyer)).ok).toBe(false)
  })
  test('rechaza refId que no sea un UUID con guiones', async () => {
    expect((await verifier.verificar(await prueba({ refId: 'a'.repeat(36) }), buyer)).ok).toBe(
      false,
    )
  })
})
