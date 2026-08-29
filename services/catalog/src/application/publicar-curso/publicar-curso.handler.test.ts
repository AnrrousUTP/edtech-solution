import { describe, expect, test } from 'bun:test'
import { FakeClock, validarContra } from '@edtech/shared-kernel'
import { InMemoryEventPublisher } from '@edtech/shared-kernel/testing'
import { PublicarCursoHandler } from './publicar-curso.handler'
import { ActualizarContenidoHandler } from '../actualizar-contenido/actualizar-contenido.handler'
import { CrearCursoHandler } from '../crear-curso/crear-curso.handler'
import { FakeContenidoStore, InMemoryCursoRepository } from '../dobles'

const montarCurso = async (repo: InMemoryCursoRepository, publisher: InMemoryEventPublisher) => {
  const store = new FakeContenidoStore()
  const crear = new CrearCursoHandler(repo)
  const contenido = new ActualizarContenidoHandler(repo, store, publisher)

  const creado = await crear.execute({
    _tag: 'CrearCurso',
    slug: 'html-esencial',
    titulo: 'HTML Esencial',
    descripcion: 'Curso de HTML',
    tecnologia: 'HTML',
    nivelMin: 'A',
    nivelMax: 'B',
    precio: 0,
    moneda: 'USD',
  })
  if (!creado.ok) throw creado.error

  const r = await contenido.execute({
    _tag: 'ActualizarContenido',
    cursoId: creado.value.cursoId,
    tomos: [
      {
        orden: 1,
        titulo: 'Fundamentos',
        umbral: 70,
        lecciones: [
          {
            orden: 1,
            titulo: 'Etiquetas',
            duracionMin: 10,
            bloques: [{ orden: 1, tipo: 'TEXTO', contenido: { markdown: '# Hola' } }],
          },
        ],
      },
    ],
  })
  if (!r.ok) throw r.error
  return { cursoId: creado.value.cursoId, store }
}

describe('PublicarCursoHandler', () => {
  test('publica, emite curso-publicado + contenido-actualizado por tomo, y ambos cumplen su contrato', async () => {
    const repo = new InMemoryCursoRepository()
    const publisher = new InMemoryEventPublisher()
    const { cursoId, store } = await montarCurso(repo, publisher)
    const handler = new PublicarCursoHandler(
      repo,
      store,
      publisher,
      new FakeClock(new Date('2026-08-28T12:00:00Z')),
    )

    const r = await handler.execute({ _tag: 'PublicarCurso', cursoId })
    expect(r.ok).toBe(true)

    const publicado = publisher.porTipo('catalog.curso-publicado.v1')
    expect(publicado).toHaveLength(1)
    expect(validarContra('catalog.curso-publicado.v1', publicado[0]!.payload())).toEqual({
      valido: true,
    })

    const contenido = publisher.porTipo('catalog.contenido-actualizado.v1')
    expect(contenido).toHaveLength(1)
    expect(validarContra('catalog.contenido-actualizado.v1', contenido[0]!.payload())).toEqual({
      valido: true,
    })
  })

  test('publicar un curso sin contenido devuelve CURSO_NO_PUBLICABLE', async () => {
    const repo = new InMemoryCursoRepository()
    const publisher = new InMemoryEventPublisher()
    const crear = new CrearCursoHandler(repo)
    const creado = await crear.execute({
      _tag: 'CrearCurso',
      slug: 'vacio',
      titulo: 'Vacío',
      descripcion: 'x',
      tecnologia: 'X',
      nivelMin: 'A',
      nivelMax: 'A',
      precio: 0,
      moneda: 'USD',
    })
    if (!creado.ok) throw creado.error
    const handler = new PublicarCursoHandler(
      repo,
      new FakeContenidoStore(),
      publisher,
      new FakeClock(new Date()),
    )
    const r = await handler.execute({ _tag: 'PublicarCurso', cursoId: creado.value.cursoId })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('CURSO_NO_PUBLICABLE')
  })

  test('slug duplicado devuelve SLUG_DUPLICADO', async () => {
    const repo = new InMemoryCursoRepository()
    const crear = new CrearCursoHandler(repo)
    const cmd = {
      _tag: 'CrearCurso' as const,
      slug: 'repetido',
      titulo: 'X',
      descripcion: 'x',
      tecnologia: 'X',
      nivelMin: 'A',
      nivelMax: 'A',
      precio: 0,
      moneda: 'USD',
    }
    await crear.execute(cmd)
    const r = await crear.execute(cmd)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('SLUG_DUPLICADO')
  })
})

describe('contrato de precio-actualizado (doc 12 §5)', () => {
  test('el evento emitido valida contra el schema congelado', async () => {
    const repo = new InMemoryCursoRepository()
    const publisher = new InMemoryEventPublisher()
    const { cursoId, store } = await montarCurso(repo, publisher)
    await new PublicarCursoHandler(repo, store, publisher, new FakeClock(new Date())).execute({
      _tag: 'PublicarCurso',
      cursoId,
    })
    publisher.limpiar()

    const { ActualizarCursoHandler } = await import('../actualizar-curso/actualizar-curso.handler')
    const r = await new ActualizarCursoHandler(repo, publisher).execute({
      _tag: 'ActualizarCurso',
      cursoId,
      precio: 9.9,
    })
    expect(r.ok).toBe(true)
    const evento = publisher.porTipo('catalog.precio-actualizado.v1')[0]
    expect(evento).toBeDefined()
    expect(validarContra('catalog.precio-actualizado.v1', evento!.payload())).toEqual({
      valido: true,
    })
  })
})
