import { describe, expect, test } from 'bun:test'
import { UniqueId } from '@edtech/shared-kernel'
import { PerfilGamificacion, SIN_REFERENCIA } from './perfil-gamificacion.entity'

const CURSO = crypto.randomUUID()
const dia = (n: number): Date => new Date(`2026-08-${String(n).padStart(2, '0')}T15:00:00Z`)

describe('PerfilGamificacion — insignias (I-7)', () => {
  test('la misma insignia dos veces se otorga UNA sola vez', () => {
    const p = PerfilGamificacion.crear(UniqueId.nuevo())
    expect(p.otorgarInsignia('CURSO_COMPLETADO', CURSO, dia(1))).toBe(true)
    expect(p.otorgarInsignia('CURSO_COMPLETADO', CURSO, dia(2))).toBe(false)
    expect(p.insignias).toHaveLength(1)
    expect(p.pullEvents()).toHaveLength(1)
  })

  test('el mismo criterio con OTRA referencia sí se otorga', () => {
    const p = PerfilGamificacion.crear(UniqueId.nuevo())
    p.otorgarInsignia('CURSO_COMPLETADO', CURSO, dia(1))
    expect(p.otorgarInsignia('CURSO_COMPLETADO', crypto.randomUUID(), dia(1))).toBe(true)
    expect(p.insignias).toHaveLength(2)
  })
})

describe('PerfilGamificacion — racha con ventana de gracia', () => {
  test('la primera actividad arranca la racha en 1', () => {
    const p = PerfilGamificacion.crear(UniqueId.nuevo())
    p.registrarActividad(dia(1))
    expect(p.rachaActual).toBe(1)
  })

  test('actividad en días consecutivos extiende la racha', () => {
    const p = PerfilGamificacion.crear(UniqueId.nuevo())
    p.registrarActividad(dia(1))
    p.registrarActividad(dia(2))
    p.registrarActividad(dia(3))
    expect(p.rachaActual).toBe(3)
    expect(p.rachaMaxima).toBe(3)
  })

  test('dos actividades el MISMO día no extienden la racha', () => {
    const p = PerfilGamificacion.crear(UniqueId.nuevo())
    p.registrarActividad(new Date('2026-08-01T10:00:00Z'))
    p.registrarActividad(new Date('2026-08-01T20:00:00Z'))
    expect(p.rachaActual).toBe(1)
  })

  test('saltar un día entra en la ventana de gracia y NO rompe la racha', () => {
    const p = PerfilGamificacion.crear(UniqueId.nuevo())
    p.registrarActividad(dia(1))
    p.registrarActividad(dia(3)) // 48 h exactas: dentro de la gracia
    expect(p.rachaActual).toBe(2)
  })

  test('más de 48 h rompen la racha y emiten racha-rota', () => {
    const p = PerfilGamificacion.crear(UniqueId.nuevo())
    p.registrarActividad(dia(1))
    p.registrarActividad(dia(2))
    p.pullEvents()

    p.registrarActividad(dia(6))
    expect(p.rachaActual).toBe(1)
    expect(p.rachaMaxima).toBe(2)
    const rota = p.pullEvents().filter(e => e.eventType === 'gamification.racha-rota.v1')
    expect(rota).toHaveLength(1)
    expect(rota[0]?.payload()).toMatchObject({ rachaPerdida: 2 })
  })

  test('llegar a 7 días otorga la insignia RACHA_7 con el UUID nulo', () => {
    const p = PerfilGamificacion.crear(UniqueId.nuevo())
    for (let d = 1; d <= 7; d++) p.registrarActividad(dia(d))
    expect(p.rachaActual).toBe(7)
    expect(p.tieneInsignia('RACHA_7', SIN_REFERENCIA)).toBe(true)
  })
})
