import { describe, expect, test } from 'bun:test'
import { UniqueId } from '@edtech/shared-kernel'
import { Usuario } from './usuario.entity'
import { Email } from '../value-objects/email.vo'
import { Nivel } from '../value-objects/nivel.vo'

const email = (): Email => {
  const r = Email.crear('lorena@edtech.test')
  if (!r.ok) throw r.error
  return r.value
}
const nivel = (letra: string): Nivel => {
  const r = Nivel.crear(letra)
  if (!r.ok) throw r.error
  return r.value
}

describe('Usuario', () => {
  test('crearDesdeCognito arranca en nivel A, rol ESTUDIANTE y registra el evento', () => {
    const u = Usuario.crearDesdeCognito(UniqueId.nuevo(), email(), 'Lorena')
    expect(u.nivel.valor).toBe('A')
    expect(u.rol).toBe('ESTUDIANTE')
    const eventos = u.pullEvents()
    expect(eventos).toHaveLength(1)
    expect(eventos[0]?.eventType).toBe('identity.usuario-registrado.v1')
  })

  test('pullEvents vacía la lista (no re-publica)', () => {
    const u = Usuario.crearDesdeCognito(UniqueId.nuevo(), email(), 'Lorena')
    u.pullEvents()
    expect(u.pullEvents()).toHaveLength(0)
  })

  test('subirNivelPorCurso aplica max(): sube de A a D', () => {
    const u = Usuario.crearDesdeCognito(UniqueId.nuevo(), email(), 'Lorena')
    u.pullEvents()
    u.subirNivelPorCurso(nivel('D'))
    expect(u.nivel.valor).toBe('D')
    expect(u.origenNivel).toBe('PROGRESION')
    const eventos = u.pullEvents()
    expect(eventos).toHaveLength(1)
    expect(eventos[0]?.payload()).toMatchObject({
      nivelAnterior: 'A',
      nivelNuevo: 'D',
      origen: 'PROGRESION',
    })
  })

  test('regla de no-castigo: el nivel nunca baja', () => {
    const u = Usuario.crearDesdeCognito(UniqueId.nuevo(), email(), 'Lorena')
    u.subirNivelPorCurso(nivel('J'))
    u.pullEvents()
    u.fijarNivelPorTest(nivel('C'))
    expect(u.nivel.valor).toBe('J')
    // No hubo cambio de letra → no hay evento de nivel
    expect(
      u.pullEvents().filter(e => e.eventType === 'identity.nivel-actualizado.v1'),
    ).toHaveLength(0)
  })

  test('fijarNivelPorTest sube y cambia el origen a TEST', () => {
    const u = Usuario.crearDesdeCognito(UniqueId.nuevo(), email(), 'Lorena')
    u.pullEvents()
    u.fijarNivelPorTest(nivel('F'))
    expect(u.nivel.valor).toBe('F')
    expect(u.origenNivel).toBe('TEST')
  })

  test('actualizarPerfil valida y registra los campos cambiados', () => {
    const u = Usuario.crearDesdeCognito(UniqueId.nuevo(), email(), 'Lorena')
    u.pullEvents()
    const r = u.actualizarPerfil({ nombreVisible: 'Lore', pais: 'PE' })
    expect(r.ok).toBe(true)
    const eventos = u.pullEvents()
    expect(eventos[0]?.payload()).toMatchObject({ campos: ['nombreVisible', 'pais'] })
  })

  test('actualizarPerfil rechaza un país inválido', () => {
    const u = Usuario.crearDesdeCognito(UniqueId.nuevo(), email(), 'Lorena')
    const r = u.actualizarPerfil({ pais: 'Perú' })
    expect(r.ok).toBe(false)
  })
})

describe('Nivel', () => {
  test('acepta A-N y rechaza otro valor', () => {
    expect(Nivel.crear('a').ok).toBe(true)
    expect(Nivel.crear('N').ok).toBe(true)
    expect(Nivel.crear('Z').ok).toBe(false)
    expect(Nivel.crear('').ok).toBe(false)
  })

  test('maximo() devuelve el mayor', () => {
    expect(nivel('C').maximo(nivel('B')).valor).toBe('C')
    expect(nivel('C').maximo(nivel('K')).valor).toBe('K')
  })
})
