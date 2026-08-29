import { describe, expect, test } from 'bun:test'
import { FakeClock, UniqueId, validarContra } from '@edtech/shared-kernel'
import { InMemoryEventPublisher } from '@edtech/shared-kernel/testing'
import { CompletarLeccionHandler } from './completar-leccion.handler'
import { Matricula } from '../../domain/entities/matricula.entity'
import {
  CursoProyectado,
  type TomoProyectado,
} from '../../domain/value-objects/curso-proyectado.vo'
import { FakeCarreras, InMemoryMatriculaRepository, InMemoryProyeccionRepository } from '../dobles'

const USUARIO = crypto.randomUUID()
const CURSO = crypto.randomUUID()
const TOMO = crypto.randomUUID()
const L1 = crypto.randomUUID()
const L2 = crypto.randomUUID()
const CARRERA = crypto.randomUUID()

const tomo: TomoProyectado = {
  id: TOMO,
  orden: 1,
  titulo: 'Tomo 1',
  umbral: 70,
  leccionIds: [L1, L2],
}

const montar = async (opciones: { carreras?: FakeCarreras } = {}) => {
  const matriculas = new InMemoryMatriculaRepository()
  const proyeccion = new InMemoryProyeccionRepository()
  const publisher = new InMemoryEventPublisher()
  const reloj = new FakeClock(new Date('2026-08-28T12:00:00Z'))

  proyeccion.sembrar(new CursoProyectado(CURSO, 'CSS desde Cero', 'css', true, 19.9, 'E', [tomo]))
  const matricula = Matricula.gratuita(UniqueId.desde(USUARIO), UniqueId.desde(CURSO))
  matricula.pullEvents()
  await matriculas.guardar(matricula)

  const handler = new CompletarLeccionHandler(
    matriculas,
    proyeccion,
    opciones.carreras ?? new FakeCarreras(),
    publisher,
    reloj,
  )
  return { matriculas, proyeccion, publisher, handler }
}

describe('CompletarLeccionHandler', () => {
  test('completa la lección y publica leccion-completada con contrato válido', async () => {
    const { handler, publisher } = await montar()
    const r = await handler.execute({
      _tag: 'CompletarLeccion',
      usuarioId: USUARIO,
      cursoId: CURSO,
      leccionId: L1,
    })

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.tomoCompletado).toBe(false)
    const evento = publisher.porTipo('enrollment.leccion-completada.v1')[0]
    expect(validarContra('enrollment.leccion-completada.v1', evento!.payload())).toEqual({
      valido: true,
    })
  })

  test('sin matrícula devuelve SIN_MATRICULA (403)', async () => {
    const { handler } = await montar()
    const r = await handler.execute({
      _tag: 'CompletarLeccion',
      usuarioId: crypto.randomUUID(),
      cursoId: CURSO,
      leccionId: L1,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('SIN_MATRICULA')
  })

  test('completar todas las lecciones con la evaluación aprobada cierra tomo y curso', async () => {
    const { handler, matriculas, publisher } = await montar()
    matriculas.aprobadas.set(TOMO, 90)

    await handler.execute({
      _tag: 'CompletarLeccion',
      usuarioId: USUARIO,
      cursoId: CURSO,
      leccionId: L1,
    })
    const r = await handler.execute({
      _tag: 'CompletarLeccion',
      usuarioId: USUARIO,
      cursoId: CURSO,
      leccionId: L2,
    })

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.tomoCompletado).toBe(true)
      expect(r.value.cursoCompletado).toBe(true)
    }

    const tomoEvento = publisher.porTipo('enrollment.tomo-completado.v1')[0]
    const cursoEvento = publisher.porTipo('enrollment.curso-completado.v1')[0]
    expect(validarContra('enrollment.tomo-completado.v1', tomoEvento!.payload())).toEqual({
      valido: true,
    })
    expect(validarContra('enrollment.curso-completado.v1', cursoEvento!.payload())).toEqual({
      valido: true,
    })
    // A-11: el nivelMax viaja para que identity suba el nivel sin consultar catalog
    expect(cursoEvento!.payload()).toMatchObject({ nivelMax: 'E' })
  })

  test('reprocesar la misma lección no duplica eventos (I-2 a nivel de caso de uso)', async () => {
    const { handler, publisher } = await montar()
    const cmd = {
      _tag: 'CompletarLeccion' as const,
      usuarioId: USUARIO,
      cursoId: CURSO,
      leccionId: L1,
    }
    await handler.execute(cmd)
    await handler.execute(cmd)
    expect(publisher.porTipo('enrollment.leccion-completada.v1')).toHaveLength(1)
  })

  test('al completar el único curso de una carrera se emite carrera-completada', async () => {
    const carreras = new FakeCarreras([
      { carreraId: CARRERA, titulo: 'Desarrollo Web desde Cero', cursoIds: [CURSO] },
    ])
    const { handler, matriculas, publisher } = await montar({ carreras })
    matriculas.aprobadas.set(TOMO, 100)

    await handler.execute({
      _tag: 'CompletarLeccion',
      usuarioId: USUARIO,
      cursoId: CURSO,
      leccionId: L1,
    })
    await handler.execute({
      _tag: 'CompletarLeccion',
      usuarioId: USUARIO,
      cursoId: CURSO,
      leccionId: L2,
    })

    const evento = publisher.porTipo('enrollment.carrera-completada.v1')[0]
    expect(evento).toBeDefined()
    expect(validarContra('enrollment.carrera-completada.v1', evento!.payload())).toEqual({
      valido: true,
    })
  })

  test('si catalog no responde, el curso se completa igual y NO se emite carrera-completada (A-24)', async () => {
    class CarrerasCaidas extends FakeCarreras {
      override async carrerasPublicadas(): Promise<never> {
        throw new Error('timeout')
      }
    }
    const { handler, matriculas, publisher } = await montar({ carreras: new CarrerasCaidas() })
    matriculas.aprobadas.set(TOMO, 100)

    await handler.execute({
      _tag: 'CompletarLeccion',
      usuarioId: USUARIO,
      cursoId: CURSO,
      leccionId: L1,
    })
    const r = await handler.execute({
      _tag: 'CompletarLeccion',
      usuarioId: USUARIO,
      cursoId: CURSO,
      leccionId: L2,
    })

    expect(r.ok).toBe(true)
    expect(publisher.porTipo('enrollment.curso-completado.v1')).toHaveLength(1)
    expect(publisher.porTipo('enrollment.carrera-completada.v1')).toHaveLength(0)
  })
})
