import { describe, expect, test } from 'bun:test'
import { UniqueId } from '@edtech/shared-kernel'
import { Matricula } from './matricula.entity'
import { CursoProyectado, type TomoProyectado } from '../value-objects/curso-proyectado.vo'

const AHORA = new Date('2026-08-28T12:00:00Z')

const tomo = (id: string, lecciones: string[], orden = 1): TomoProyectado => ({
  id,
  orden,
  titulo: `Tomo ${orden}`,
  umbral: 70,
  leccionIds: lecciones,
})

const L1 = crypto.randomUUID()
const L2 = crypto.randomUUID()
const T1 = crypto.randomUUID()

describe('Matricula', () => {
  test('habilitarPorPago crea ACTIVA y registra matricula-creada con ordenId', () => {
    const ordenId = UniqueId.nuevo()
    const m = Matricula.habilitarPorPago(UniqueId.nuevo(), UniqueId.nuevo(), ordenId)
    expect(m.estado).toBe('ACTIVA')
    expect(m.origen).toBe('PAGO')
    const eventos = m.pullEvents()
    expect(eventos).toHaveLength(1)
    expect(eventos[0]?.payload()).toMatchObject({ origen: 'PAGO', ordenId: ordenId.valor })
  })

  test('completar la misma lección dos veces registra UN solo evento (idempotente)', () => {
    const m = Matricula.gratuita(UniqueId.nuevo(), UniqueId.nuevo())
    m.pullEvents()
    const t = tomo(T1, [L1, L2])

    expect(m.completarLeccion(L1, t, AHORA).ok).toBe(true)
    expect(m.completarLeccion(L1, t, AHORA).ok).toBe(true)

    expect(m.leccionesCompletadas.size).toBe(1)
    expect(
      m.pullEvents().filter(e => e.eventType === 'enrollment.leccion-completada.v1'),
    ).toHaveLength(1)
  })

  test('una lección fuera del curso devuelve Err', () => {
    const m = Matricula.gratuita(UniqueId.nuevo(), UniqueId.nuevo())
    const r = m.completarLeccion(crypto.randomUUID(), tomo(T1, [L1]), AHORA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('LECCION_FUERA_DEL_CURSO')
  })

  test('una matrícula revocada no admite progreso', () => {
    const m = Matricula.gratuita(UniqueId.nuevo(), UniqueId.nuevo())
    m.revocar()
    const r = m.completarLeccion(L1, tomo(T1, [L1]), AHORA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('MATRICULA_NO_ACTIVA')
  })

  test('el tomo NO se completa sin todas las lecciones, aunque la evaluación esté aprobada', () => {
    const m = Matricula.gratuita(UniqueId.nuevo(), UniqueId.nuevo())
    const t = tomo(T1, [L1, L2])
    m.completarLeccion(L1, t, AHORA)
    expect(m.intentarCompletarTomo(t, true, 90)).toBe(false)
  })

  test('el tomo NO se completa con todas las lecciones si la evaluación no está aprobada', () => {
    const m = Matricula.gratuita(UniqueId.nuevo(), UniqueId.nuevo())
    const t = tomo(T1, [L1, L2])
    m.completarLeccion(L1, t, AHORA)
    m.completarLeccion(L2, t, AHORA)
    expect(m.intentarCompletarTomo(t, false, 40)).toBe(false)
  })

  test('el tomo se completa con lecciones + evaluación, y solo una vez', () => {
    const m = Matricula.gratuita(UniqueId.nuevo(), UniqueId.nuevo())
    const t = tomo(T1, [L1, L2])
    m.completarLeccion(L1, t, AHORA)
    m.completarLeccion(L2, t, AHORA)
    m.pullEvents()

    expect(m.intentarCompletarTomo(t, true, 85)).toBe(true)
    expect(m.intentarCompletarTomo(t, true, 85)).toBe(false)

    const eventos = m.pullEvents()
    expect(eventos).toHaveLength(1)
    expect(eventos[0]?.payload()).toMatchObject({ tomoId: T1, puntaje: 85 })
  })

  test('el curso se completa cuando todos los tomos están completos, con cursoTitulo y nivelMax', () => {
    const cursoId = UniqueId.nuevo()
    const m = Matricula.gratuita(UniqueId.nuevo(), cursoId)
    const t = tomo(T1, [L1])
    m.completarLeccion(L1, t, AHORA)
    m.intentarCompletarTomo(t, true, 100)
    m.pullEvents()

    const curso = new CursoProyectado(cursoId.valor, 'CSS desde Cero', 'css', true, 19.9, 'E', [t])
    expect(m.intentarCompletarCurso(curso, AHORA)).toBe(true)

    const evento = m.pullEvents()[0]
    expect(evento?.eventType).toBe('enrollment.curso-completado.v1')
    expect(evento?.payload()).toMatchObject({ cursoTitulo: 'CSS desde Cero', nivelMax: 'E' })
  })

  test('el curso no se completa con un tomo pendiente', () => {
    const cursoId = UniqueId.nuevo()
    const m = Matricula.gratuita(UniqueId.nuevo(), cursoId)
    const t1 = tomo(T1, [L1], 1)
    const t2 = tomo(crypto.randomUUID(), [L2], 2)
    m.completarLeccion(L1, t1, AHORA)
    m.intentarCompletarTomo(t1, true, 100)

    const curso = new CursoProyectado(cursoId.valor, 'X', 'x', true, 0, 'B', [t1, t2])
    expect(m.intentarCompletarCurso(curso, AHORA)).toBe(false)
  })
})
