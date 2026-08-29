import { describe, expect, test } from 'bun:test'
import { tiposDeEventoConocidos, validarContra } from './validador'

describe('validador de contratos de eventos', () => {
  test('el catálogo tiene exactamente 26 eventos (doc 05 §2)', () => {
    expect(tiposDeEventoConocidos()).toHaveLength(26)
  })

  test('un payload válido de pago-confirmado valida', () => {
    const r = validarContra('payments.pago-confirmado.v1', {
      ordenId: crypto.randomUUID(),
      usuarioId: crypto.randomUUID(),
      cursoId: crypto.randomUUID(),
      monto: 19.9,
      moneda: 'USD',
      capturaId: '8XA123',
      confirmadoAt: new Date().toISOString(),
    })
    expect(r).toEqual({ valido: true })
  })

  test('un payload sin campo obligatorio NO valida', () => {
    const r = validarContra('payments.pago-confirmado.v1', {
      ordenId: crypto.randomUUID(),
      monto: 19.9,
    })
    expect(r.valido).toBe(false)
  })

  test('un campo con tipo equivocado NO valida', () => {
    const r = validarContra('enrollment.tomo-completado.v1', {
      matriculaId: crypto.randomUUID(),
      usuarioId: crypto.randomUUID(),
      cursoId: crypto.randomUUID(),
      tomoId: crypto.randomUUID(),
      puntaje: 'ochenta',
    })
    expect(r.valido).toBe(false)
  })

  test('un campo opcional puede faltar (matricula-creada sin ordenId)', () => {
    const r = validarContra('enrollment.matricula-creada.v1', {
      matriculaId: crypto.randomUUID(),
      usuarioId: crypto.randomUUID(),
      cursoId: crypto.randomUUID(),
      origen: 'GRATUITO',
    })
    expect(r).toEqual({ valido: true })
  })

  test('un evento fuera del catálogo NO valida', () => {
    const r = validarContra('catalog.evento-inventado.v1', {})
    expect(r.valido).toBe(false)
  })

  test('un campo nuevo opcional no rompe el contrato (evolución compatible, doc 05 §8)', () => {
    const r = validarContra('gamification.racha-extendida.v1', {
      usuarioId: crypto.randomUUID(),
      rachaActual: 7,
      campoNuevoOpcional: 'ok',
    })
    expect(r).toEqual({ valido: true })
  })
})
