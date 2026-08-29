import { describe, expect, test } from 'bun:test'
import { UniqueId } from '@edtech/shared-kernel'
import { InMemoryEventPublisher } from '@edtech/shared-kernel/testing'
import { Usuario } from '../../domain/entities/usuario.entity'
import { Email } from '../../domain/value-objects/email.vo'
import { InMemoryUsuarioRepository } from '../dobles'
import { SubirNivelPorCursoHandler } from './subir-nivel.handler'
import { FijarNivelPorTestHandler } from '../fijar-nivel-por-test/fijar-nivel-por-test.handler'

const sembrarUsuario = async (repo: InMemoryUsuarioRepository): Promise<string> => {
  const email = Email.crear('e@edtech.test')
  if (!email.ok) throw email.error
  const u = Usuario.crearDesdeCognito(UniqueId.nuevo(), email.value, 'E')
  u.pullEvents()
  await repo.guardar(u)
  return u.id.valor
}

describe('SubirNivelPorCursoHandler', () => {
  test('sube el nivel al nivelMax del curso y publica nivel-actualizado', async () => {
    const repo = new InMemoryUsuarioRepository()
    const publisher = new InMemoryEventPublisher()
    const id = await sembrarUsuario(repo)
    const handler = new SubirNivelPorCursoHandler(repo, publisher)

    const r = await handler.execute({
      _tag: 'SubirNivelPorCurso',
      usuarioId: id,
      nivelMaxCurso: 'E',
    })

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.nivel).toBe('E')
    expect(publisher.porTipo('identity.nivel-actualizado.v1')).toHaveLength(1)
  })

  test('sin nivelMaxCurso no cambia nada (payload viejo sin el campo A-11)', async () => {
    const repo = new InMemoryUsuarioRepository()
    const publisher = new InMemoryEventPublisher()
    const id = await sembrarUsuario(repo)
    const handler = new SubirNivelPorCursoHandler(repo, publisher)

    const r = await handler.execute({ _tag: 'SubirNivelPorCurso', usuarioId: id })

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.nivel).toBe('A')
    expect(publisher.publicados).toHaveLength(0)
  })

  test('usuario inexistente devuelve Err de negocio', async () => {
    const handler = new SubirNivelPorCursoHandler(
      new InMemoryUsuarioRepository(),
      new InMemoryEventPublisher(),
    )
    const r = await handler.execute({
      _tag: 'SubirNivelPorCurso',
      usuarioId: crypto.randomUUID(),
      nivelMaxCurso: 'B',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('USUARIO_NO_ENCONTRADO')
  })
})

describe('FijarNivelPorTestHandler', () => {
  test('fija el nivel del test (origen TEST)', async () => {
    const repo = new InMemoryUsuarioRepository()
    const publisher = new InMemoryEventPublisher()
    const id = await sembrarUsuario(repo)
    const handler = new FijarNivelPorTestHandler(repo, publisher)

    const r = await handler.execute({
      _tag: 'FijarNivelPorTest',
      usuarioId: id,
      nivelResultante: 'G',
    })

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.nivel).toBe('G')
    const evento = publisher.porTipo('identity.nivel-actualizado.v1')[0]
    expect(evento?.payload()).toMatchObject({ origen: 'TEST', nivelNuevo: 'G' })
  })
})
