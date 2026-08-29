import { describe, expect, test } from 'bun:test'
import { InMemoryEventPublisher } from '@edtech/shared-kernel/testing'
import { CrearUsuarioHandler } from './crear-usuario.handler'
import { InMemoryUsuarioRepository } from '../dobles'

const SUB = crypto.randomUUID()

describe('CrearUsuarioHandler', () => {
  test('crea el usuario y publica usuario-registrado', async () => {
    const repo = new InMemoryUsuarioRepository()
    const publisher = new InMemoryEventPublisher()
    const handler = new CrearUsuarioHandler(repo, publisher)

    const r = await handler.execute({
      _tag: 'CrearUsuario',
      sub: SUB,
      email: 'estudiante@edtech.test',
      nombreVisible: 'Estudiante',
    })

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.creado).toBe(true)
    expect(repo.guardados.size).toBe(1)
    expect(publisher.porTipo('identity.usuario-registrado.v1')).toHaveLength(1)
  })

  test('es idempotente: la segunda vez no crea ni re-publica', async () => {
    const repo = new InMemoryUsuarioRepository()
    const publisher = new InMemoryEventPublisher()
    const handler = new CrearUsuarioHandler(repo, publisher)
    const cmd = {
      _tag: 'CrearUsuario' as const,
      sub: SUB,
      email: 'estudiante@edtech.test',
      nombreVisible: 'Estudiante',
    }

    await handler.execute(cmd)
    const r2 = await handler.execute(cmd)

    expect(r2.ok).toBe(true)
    if (r2.ok) expect(r2.value.creado).toBe(false)
    expect(publisher.porTipo('identity.usuario-registrado.v1')).toHaveLength(1)
  })

  test('rechaza un email inválido', async () => {
    const handler = new CrearUsuarioHandler(
      new InMemoryUsuarioRepository(),
      new InMemoryEventPublisher(),
    )
    const r = await handler.execute({
      _tag: 'CrearUsuario',
      sub: SUB,
      email: 'no-es-email',
      nombreVisible: 'X',
    })
    expect(r.ok).toBe(false)
  })
})
