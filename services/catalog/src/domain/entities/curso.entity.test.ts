import { describe, expect, test } from 'bun:test'
import { Curso, type TomoInfo } from './curso.entity'
import { Dinero } from '../value-objects/dinero.vo'
import { Nivel } from '../value-objects/nivel.vo'
import { Slug } from '../value-objects/slug.vo'

const valor = <T, E extends Error>(r: { ok: true; value: T } | { ok: false; error: E }): T => {
  if (!r.ok) throw r.error
  return r.value
}

const crearCurso = (): Curso =>
  valor(
    Curso.crear({
      slug: valor(Slug.crear('css-desde-cero')),
      titulo: 'CSS desde Cero',
      descripcion: 'Curso de CSS',
      tecnologia: 'CSS',
      nivelMin: valor(Nivel.crear('C')),
      nivelMax: valor(Nivel.crear('E')),
      precio: valor(Dinero.crear(19.9, 'USD')),
    }),
  )

const tomoConLecciones = (n = 1): TomoInfo => ({
  id: crypto.randomUUID(),
  orden: n,
  titulo: `Tomo ${n}`,
  descripcion: null,
  umbral: 70,
  lecciones: [
    { id: crypto.randomUUID(), orden: 1, titulo: 'L1', duracionMin: 10, contenidoHash: 'h1' },
  ],
})

const AHORA = new Date('2026-08-28T12:00:00Z')

describe('Curso', () => {
  test('no se publica sin al menos un tomo', () => {
    const curso = crearCurso()
    const r = curso.publicar(AHORA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('CURSO_NO_PUBLICABLE')
  })

  test('no se publica con un tomo sin lecciones', () => {
    const curso = crearCurso()
    valor(curso.reemplazarTomos([{ ...tomoConLecciones(), lecciones: [] }]))
    expect(curso.publicar(AHORA).ok).toBe(false)
  })

  test('publicar registra curso-publicado con la estructura completa', () => {
    const curso = crearCurso()
    valor(curso.reemplazarTomos([tomoConLecciones(1)]))
    valor(curso.publicar(AHORA))
    expect(curso.estado).toBe('PUBLICADO')
    const eventos = curso.pullEvents()
    expect(eventos).toHaveLength(1)
    const payload = eventos[0]?.payload() as Record<string, unknown>
    expect(payload.slug).toBe('css-desde-cero')
    expect(payload.versionPrecio).toBe(1)
    expect((payload.estructura as unknown[]).length).toBe(1)
  })

  test('publicar dos veces es idempotente (sin segundo evento)', () => {
    const curso = crearCurso()
    valor(curso.reemplazarTomos([tomoConLecciones(1)]))
    valor(curso.publicar(AHORA))
    curso.pullEvents()
    valor(curso.publicar(AHORA))
    expect(curso.pullEvents()).toHaveLength(0)
  })

  test('el orden de tomos debe ser contiguo desde 1', () => {
    const curso = crearCurso()
    const t1 = tomoConLecciones(1)
    const t3 = { ...tomoConLecciones(1), id: crypto.randomUUID(), orden: 3 }
    const r = curso.reemplazarTomos([t1, t3])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('ORDEN_NO_CONTIGUO')
  })

  test('cambiar precio en borrador NO versiona ni emite evento', () => {
    const curso = crearCurso()
    curso.cambiarPrecio(valor(Dinero.crear(24.9, 'USD')))
    expect(curso.versionPrecio).toBe(1)
    expect(curso.pullEvents()).toHaveLength(0)
  })

  test('cambiar precio publicado versiona y emite precio-actualizado', () => {
    const curso = crearCurso()
    valor(curso.reemplazarTomos([tomoConLecciones(1)]))
    valor(curso.publicar(AHORA))
    curso.pullEvents()

    curso.cambiarPrecio(valor(Dinero.crear(24.9, 'USD')))
    expect(curso.versionPrecio).toBe(2)
    const eventos = curso.pullEvents()
    expect(eventos[0]?.eventType).toBe('catalog.precio-actualizado.v1')
    expect(eventos[0]?.payload()).toMatchObject({
      montoAnterior: 19.9,
      montoNuevo: 24.9,
      versionPrecio: 2,
    })
  })

  test('el mismo precio no versiona (sin rastro falso)', () => {
    const curso = crearCurso()
    valor(curso.reemplazarTomos([tomoConLecciones(1)]))
    valor(curso.publicar(AHORA))
    curso.pullEvents()
    curso.cambiarPrecio(valor(Dinero.crear(19.9, 'USD')))
    expect(curso.versionPrecio).toBe(1)
    expect(curso.pullEvents()).toHaveLength(0)
  })

  test('despublicar solo aplica a publicados y emite el evento', () => {
    const curso = crearCurso()
    curso.despublicar('prueba')
    expect(curso.pullEvents()).toHaveLength(0)

    valor(curso.reemplazarTomos([tomoConLecciones(1)]))
    valor(curso.publicar(AHORA))
    curso.pullEvents()
    curso.despublicar('contenido desactualizado')
    expect(curso.estado).toBe('DESPUBLICADO')
    expect(curso.pullEvents()[0]?.eventType).toBe('catalog.curso-despublicado.v1')
  })

  test('nivelMax < nivelMin no construye', () => {
    const r = Curso.crear({
      slug: valor(Slug.crear('x')),
      titulo: 'X',
      descripcion: 'X',
      tecnologia: 'X',
      nivelMin: valor(Nivel.crear('E')),
      nivelMax: valor(Nivel.crear('C')),
      precio: valor(Dinero.crear(0, 'USD')),
    })
    expect(r.ok).toBe(false)
  })
})

describe('Dinero', () => {
  test('rechaza más de 2 decimales y montos negativos', () => {
    expect(Dinero.crear(19.999, 'USD').ok).toBe(false)
    expect(Dinero.crear(-1, 'USD').ok).toBe(false)
    expect(Dinero.crear(19.9, 'usd').ok).toBe(false)
  })
})
