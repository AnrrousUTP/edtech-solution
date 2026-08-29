import { describe, expect, test } from 'bun:test'
import { FakeClock, UniqueId, validarContra } from '@edtech/shared-kernel'
import { InMemoryEventPublisher } from '@edtech/shared-kernel/testing'
import { EntregarIntentoHandler, IniciarIntentoHandler } from './gestionar-intento.handler'
import { Matricula } from '../../domain/entities/matricula.entity'
import {
  CursoProyectado,
  type TomoProyectado,
} from '../../domain/value-objects/curso-proyectado.vo'
import {
  FakeBancoRespuestas,
  FakeCarreras,
  InMemoryIntentoRepository,
  InMemoryMatriculaRepository,
  InMemoryProyeccionRepository,
} from '../dobles'

const USUARIO = crypto.randomUUID()
const CURSO = crypto.randomUUID()
const TOMO = crypto.randomUUID()
const L1 = crypto.randomUUID()
const BANCO = crypto.randomUUID()

const tomo: TomoProyectado = { id: TOMO, orden: 1, titulo: 'T1', umbral: 70, leccionIds: [L1] }

const bancoTomo = {
  bancoId: BANCO,
  umbral: 70,
  preguntas: [
    { id: 'p1', respuestaCorrecta: 'a', puntaje: 1, nivel: null },
    { id: 'p2', respuestaCorrecta: 'b', puntaje: 1, nivel: null },
  ],
}

const montar = async () => {
  const intentos = new InMemoryIntentoRepository()
  const matriculas = new InMemoryMatriculaRepository()
  const proyeccion = new InMemoryProyeccionRepository()
  const publisher = new InMemoryEventPublisher()
  const reloj = new FakeClock(new Date('2026-08-28T12:00:00Z'))

  proyeccion.sembrar(new CursoProyectado(CURSO, 'CSS', 'css', true, 19.9, 'E', [tomo]))
  const matricula = Matricula.gratuita(UniqueId.desde(USUARIO), UniqueId.desde(CURSO))
  matricula.completarLeccion(L1, tomo, reloj.ahora())
  matricula.pullEvents()
  await matriculas.guardar(matricula)

  return {
    intentos,
    matriculas,
    proyeccion,
    publisher,
    reloj,
    iniciar: new IniciarIntentoHandler(intentos, matriculas, proyeccion, reloj),
    entregar: (banco = bancoTomo) =>
      new EntregarIntentoHandler(
        intentos,
        matriculas,
        proyeccion,
        new FakeBancoRespuestas(banco),
        new FakeCarreras(),
        publisher,
        reloj,
      ),
  }
}

describe('IniciarIntentoHandler', () => {
  test('un intento de TOMO exige matrícula', async () => {
    const { iniciar } = await montar()
    const r = await iniciar.execute({
      _tag: 'IniciarIntento',
      usuarioId: crypto.randomUUID(),
      tipo: 'TOMO',
      bancoId: BANCO,
      cursoId: CURSO,
      tomoId: TOMO,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('SIN_MATRICULA')
  })

  test('un intento de NIVELACION no exige matrícula', async () => {
    const { iniciar } = await montar()
    const r = await iniciar.execute({
      _tag: 'IniciarIntento',
      usuarioId: crypto.randomUUID(),
      tipo: 'NIVELACION',
      bancoId: BANCO,
    })
    expect(r.ok).toBe(true)
  })
})

describe('EntregarIntentoHandler', () => {
  test('aprobar la evaluación emite evaluacion-aprobada y completa tomo y curso', async () => {
    const { iniciar, entregar, publisher } = await montar()
    const iniciado = await iniciar.execute({
      _tag: 'IniciarIntento',
      usuarioId: USUARIO,
      tipo: 'TOMO',
      bancoId: BANCO,
      cursoId: CURSO,
      tomoId: TOMO,
    })
    if (!iniciado.ok) throw iniciado.error

    const r = await entregar().execute({
      _tag: 'EntregarIntento',
      usuarioId: USUARIO,
      intentoId: iniciado.value.intentoId,
      respuestas: [
        { preguntaId: 'p1', respuesta: 'a' },
        { preguntaId: 'p2', respuesta: 'b' },
      ],
    })

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.puntaje).toBe(100)
      expect(r.value.aprobado).toBe(true)
      expect(r.value.tomoCompletado).toBe(true)
      expect(r.value.cursoCompletado).toBe(true)
    }

    const aprobada = publisher.porTipo('enrollment.evaluacion-aprobada.v1')[0]
    expect(validarContra('enrollment.evaluacion-aprobada.v1', aprobada!.payload())).toEqual({
      valido: true,
    })
    expect(aprobada!.payload()).toMatchObject({ perfecto: true })
    expect(publisher.porTipo('enrollment.tomo-completado.v1')).toHaveLength(1)
  })

  test('reprobar emite evaluacion-reprobada y NO completa el tomo', async () => {
    const { iniciar, entregar, publisher } = await montar()
    const iniciado = await iniciar.execute({
      _tag: 'IniciarIntento',
      usuarioId: USUARIO,
      tipo: 'TOMO',
      bancoId: BANCO,
      cursoId: CURSO,
      tomoId: TOMO,
    })
    if (!iniciado.ok) throw iniciado.error

    const r = await entregar().execute({
      _tag: 'EntregarIntento',
      usuarioId: USUARIO,
      intentoId: iniciado.value.intentoId,
      respuestas: [{ preguntaId: 'p1', respuesta: 'z' }],
    })

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.tomoCompletado).toBe(false)
    const reprobada = publisher.porTipo('enrollment.evaluacion-reprobada.v1')[0]
    expect(validarContra('enrollment.evaluacion-reprobada.v1', reprobada!.payload())).toEqual({
      valido: true,
    })
  })

  test('un intento entregado es inmutable: la segunda entrega falla', async () => {
    const { iniciar, entregar } = await montar()
    const iniciado = await iniciar.execute({
      _tag: 'IniciarIntento',
      usuarioId: USUARIO,
      tipo: 'TOMO',
      bancoId: BANCO,
      cursoId: CURSO,
      tomoId: TOMO,
    })
    if (!iniciado.ok) throw iniciado.error
    const cmd = {
      _tag: 'EntregarIntento' as const,
      usuarioId: USUARIO,
      intentoId: iniciado.value.intentoId,
      respuestas: [{ preguntaId: 'p1', respuesta: 'a' }],
    }
    await entregar().execute(cmd)
    const r = await entregar().execute(cmd)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('INTENTO_YA_ENTREGADO')
  })

  test('un intento ajeno se rechaza', async () => {
    const { iniciar, entregar } = await montar()
    const iniciado = await iniciar.execute({
      _tag: 'IniciarIntento',
      usuarioId: USUARIO,
      tipo: 'TOMO',
      bancoId: BANCO,
      cursoId: CURSO,
      tomoId: TOMO,
    })
    if (!iniciado.ok) throw iniciado.error

    const r = await entregar().execute({
      _tag: 'EntregarIntento',
      usuarioId: crypto.randomUUID(),
      intentoId: iniciado.value.intentoId,
      respuestas: [],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('INTENTO_AJENO')
  })

  test('el test de nivelación emite test-nivelacion-completado con el nivel del algoritmo', async () => {
    const { iniciar, entregar, publisher } = await montar()
    const bancoNivelacion = {
      bancoId: BANCO,
      umbral: null,
      preguntas: [
        { id: 'a1', respuestaCorrecta: 'a', puntaje: 1, nivel: 'A' },
        { id: 'a2', respuestaCorrecta: 'a', puntaje: 1, nivel: 'A' },
        { id: 'b1', respuestaCorrecta: 'a', puntaje: 1, nivel: 'B' },
        { id: 'b2', respuestaCorrecta: 'a', puntaje: 1, nivel: 'B' },
        { id: 'c1', respuestaCorrecta: 'a', puntaje: 1, nivel: 'C' },
        { id: 'c2', respuestaCorrecta: 'a', puntaje: 1, nivel: 'C' },
      ],
    }
    const iniciado = await iniciar.execute({
      _tag: 'IniciarIntento',
      usuarioId: USUARIO,
      tipo: 'NIVELACION',
      bancoId: BANCO,
    })
    if (!iniciado.ok) throw iniciado.error

    // acierta A y B completos, falla C → nivel B
    const r = await entregar(bancoNivelacion).execute({
      _tag: 'EntregarIntento',
      usuarioId: USUARIO,
      intentoId: iniciado.value.intentoId,
      respuestas: [
        { preguntaId: 'a1', respuesta: 'a' },
        { preguntaId: 'a2', respuesta: 'a' },
        { preguntaId: 'b1', respuesta: 'a' },
        { preguntaId: 'b2', respuesta: 'a' },
        { preguntaId: 'c1', respuesta: 'z' },
        { preguntaId: 'c2', respuesta: 'z' },
      ],
    })

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.nivelResultante).toBe('B')
    const evento = publisher.porTipo('enrollment.test-nivelacion-completado.v1')[0]
    expect(validarContra('enrollment.test-nivelacion-completado.v1', evento!.payload())).toEqual({
      valido: true,
    })
  })

  test('si catalog no responde, la entrega devuelve 503 y el intento sigue EN_CURSO (A-19)', async () => {
    const { iniciar, intentos, matriculas, proyeccion, publisher, reloj } = await montar()
    const iniciado = await iniciar.execute({
      _tag: 'IniciarIntento',
      usuarioId: USUARIO,
      tipo: 'TOMO',
      bancoId: BANCO,
      cursoId: CURSO,
      tomoId: TOMO,
    })
    if (!iniciado.ok) throw iniciado.error

    const { Err } = await import('@edtech/shared-kernel')
    const { BancoNoDisponibleError } = await import('../../domain/module.errors')
    const caido = {
      respuestasDe: async () => Err(new BancoNoDisponibleError('timeout')),
    }
    const handler = new EntregarIntentoHandler(
      intentos,
      matriculas,
      proyeccion,
      caido,
      new FakeCarreras(),
      publisher,
      reloj,
    )
    const r = await handler.execute({
      _tag: 'EntregarIntento',
      usuarioId: USUARIO,
      intentoId: iniciado.value.intentoId,
      respuestas: [{ preguntaId: 'p1', respuesta: 'a' }],
    })

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('BANCO_NO_DISPONIBLE')
    const intento = await intentos.porId(UniqueId.desde(iniciado.value.intentoId))
    expect(intento?.estado).toBe('EN_CURSO')
  })
})
