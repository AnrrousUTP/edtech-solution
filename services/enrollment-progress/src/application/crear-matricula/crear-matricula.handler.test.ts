import { describe, expect, test } from 'bun:test'
import { validarContra } from '@edtech/shared-kernel'
import { InMemoryEventPublisher } from '@edtech/shared-kernel/testing'
import { CrearMatriculaHandler, RevocarMatriculaHandler } from './crear-matricula.handler'
import { InMemoryMatriculaRepository, InMemoryProyeccionRepository } from '../dobles'
import { CursoProyectado } from '../../domain/value-objects/curso-proyectado.vo'

const USUARIO = crypto.randomUUID()
const CURSO = crypto.randomUUID()
const ORDEN = crypto.randomUUID()

const montar = (): {
  repo: InMemoryMatriculaRepository
  proyeccion: InMemoryProyeccionRepository
  publisher: InMemoryEventPublisher
  handler: CrearMatriculaHandler
} => {
  const repo = new InMemoryMatriculaRepository()
  const proyeccion = new InMemoryProyeccionRepository()
  const publisher = new InMemoryEventPublisher()
  return {
    repo,
    proyeccion,
    publisher,
    handler: new CrearMatriculaHandler(repo, proyeccion, publisher),
  }
}

describe('CrearMatriculaHandler', () => {
  test('un pago confirmado habilita la matrícula y el evento cumple el contrato', async () => {
    const { handler, repo, publisher } = montar()
    const r = await handler.execute({
      _tag: 'CrearMatricula',
      usuarioId: USUARIO,
      cursoId: CURSO,
      origen: 'PAGO',
      ordenId: ORDEN,
    })

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.creada).toBe(true)
    expect(repo.guardadas.size).toBe(1)

    const evento = publisher.porTipo('enrollment.matricula-creada.v1')[0]
    expect(evento).toBeDefined()
    expect(validarContra('enrollment.matricula-creada.v1', evento!.payload())).toEqual({
      valido: true,
    })
  })

  test('I-2: el MISMO pago dos veces deja UNA sola matrícula y UN solo evento', async () => {
    const { handler, repo, publisher } = montar()
    const cmd = {
      _tag: 'CrearMatricula' as const,
      usuarioId: USUARIO,
      cursoId: CURSO,
      origen: 'PAGO' as const,
      ordenId: ORDEN,
    }

    const primera = await handler.execute(cmd)
    const segunda = await handler.execute(cmd)

    expect(primera.ok && primera.value.creada).toBe(true)
    expect(segunda.ok && segunda.value.creada).toBe(false)
    expect(repo.guardadas.size).toBe(1)
    expect(publisher.porTipo('enrollment.matricula-creada.v1')).toHaveLength(1)
  })

  test('matrícula GRATUITO exige curso publicado y precio 0', async () => {
    const { handler, proyeccion } = montar()
    proyeccion.sembrar(new CursoProyectado(CURSO, 'CSS', 'css', true, 19.9, 'E', []))

    const r = await handler.execute({
      _tag: 'CrearMatricula',
      usuarioId: USUARIO,
      cursoId: CURSO,
      origen: 'GRATUITO',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('CURSO_NO_GRATUITO')
  })

  test('matrícula GRATUITO en curso gratuito publicado funciona', async () => {
    const { handler, proyeccion } = montar()
    proyeccion.sembrar(new CursoProyectado(CURSO, 'HTML', 'html', true, 0, 'B', []))

    const r = await handler.execute({
      _tag: 'CrearMatricula',
      usuarioId: USUARIO,
      cursoId: CURSO,
      origen: 'GRATUITO',
    })
    expect(r.ok).toBe(true)
  })

  test('matrícula GRATUITO en curso despublicado se rechaza', async () => {
    const { handler, proyeccion } = montar()
    proyeccion.sembrar(new CursoProyectado(CURSO, 'HTML', 'html', false, 0, 'B', []))

    const r = await handler.execute({
      _tag: 'CrearMatricula',
      usuarioId: USUARIO,
      cursoId: CURSO,
      origen: 'GRATUITO',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('CURSO_NO_PUBLICADO')
  })
})

describe('RevocarMatriculaHandler', () => {
  test('un reembolso revoca la matrícula', async () => {
    const { handler, repo } = montar()
    await handler.execute({
      _tag: 'CrearMatricula',
      usuarioId: USUARIO,
      cursoId: CURSO,
      origen: 'PAGO',
      ordenId: ORDEN,
    })

    const revocar = new RevocarMatriculaHandler(repo)
    const r = await revocar.execute({
      _tag: 'RevocarMatricula',
      usuarioId: USUARIO,
      cursoId: CURSO,
    })

    expect(r.ok).toBe(true)
    expect([...repo.guardadas.values()][0]?.estado).toBe('REVOCADA')
  })

  test('un reembolso sin matrícula no falla (error de negocio irreparable → ACK)', async () => {
    const { repo } = montar()
    const revocar = new RevocarMatriculaHandler(repo)
    const r = await revocar.execute({
      _tag: 'RevocarMatricula',
      usuarioId: crypto.randomUUID(),
      cursoId: crypto.randomUUID(),
    })
    expect(r.ok).toBe(true)
  })
})
