import { describe, expect, test } from 'bun:test'
import { FakeClock, UniqueId, validarContra } from '@edtech/shared-kernel'
import { InMemoryEventPublisher } from '@edtech/shared-kernel/testing'
import { SolicitarGeneracionHandler } from './solicitar-generacion.handler'
import { GenerarMazoHandler } from '../generar-mazo/generar-mazo.handler'
import {
  AprobarTarjetaHandler,
  RechazarTarjetaHandler,
} from '../revisar-tarjetas/revisar-tarjetas.handler'
import { TarjetasDeTomoHandler } from '../consultar-mazos/consultar-mazos.handler'
import {
  FakeColaGeneracion,
  FakeContenidoFuente,
  GeneradorDePrueba,
  GeneradorQueFalla,
  InMemoryMazoRepository,
} from '../dobles'

const CURSO = crypto.randomUUID()
const TOMO = crypto.randomUUID()
const HASH = 'hash-contenido-original'
const ADMIN = crypto.randomUUID()

const montar = (generador = new GeneradorDePrueba()) => {
  const mazos = new InMemoryMazoRepository()
  const cola = new FakeColaGeneracion()
  const publisher = new InMemoryEventPublisher()
  const reloj = new FakeClock(new Date('2026-08-28T12:00:00Z'))
  return {
    mazos,
    cola,
    publisher,
    generador,
    solicitar: new SolicitarGeneracionHandler(mazos, cola),
    generar: new GenerarMazoHandler(mazos, generador, new FakeContenidoFuente(), publisher, reloj),
    aprobar: new AprobarTarjetaHandler(mazos, publisher, reloj),
    rechazar: new RechazarTarjetaHandler(mazos, publisher, reloj),
    consultar: new TarjetasDeTomoHandler(mazos),
  }
}

const solicitud = (hash = HASH) => ({
  _tag: 'SolicitarGeneracion' as const,
  cursoId: CURSO,
  tomoId: TOMO,
  contenidoHash: hash,
  lecciones: [{ id: crypto.randomUUID(), titulo: 'Lección 1', bloquesS3Key: 's3://x/1.json' }],
})

describe('Flujo completo: generación → HITL → estudiante (I-8)', () => {
  test('el contenido nuevo crea un mazo EN_REVISION con 10 tarjetas', async () => {
    const { solicitar, generar, mazos, cola, publisher } = montar()

    const s = await solicitar.execute(solicitud())
    expect(s.ok).toBe(true)
    if (s.ok) expect(s.value.desdeCache).toBe(false)
    expect(cola.encolados).toHaveLength(1)

    const g = await generar.execute({ _tag: 'GenerarMazo', mazoId: cola.encolados[0]! })
    expect(g.ok).toBe(true)
    if (g.ok) {
      expect(g.value.estado).toBe('EN_REVISION')
      expect(g.value.tarjetas).toBe(10)
    }

    const mazo = await mazos.porId(UniqueId.desde(cola.encolados[0]!))
    expect(mazo!.tarjetas.every(t => t.estado === 'PENDIENTE_REVISION')).toBe(true)

    const evento = publisher.porTipo('flashcards.mazo-generado.v1')[0]
    expect(validarContra('flashcards.mazo-generado.v1', evento!.payload())).toEqual({
      valido: true,
    })
  })

  test('I-8: el estudiante ve 0 tarjetas antes de la aprobación', async () => {
    const { solicitar, generar, consultar, cola } = montar()
    await solicitar.execute(solicitud())
    await generar.execute({ _tag: 'GenerarMazo', mazoId: cola.encolados[0]! })

    const r = await consultar.execute({ _tag: 'TarjetasDeTomo', tomoId: TOMO })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toHaveLength(0)
  })

  test('I-8: tras aprobar 6, el estudiante ve exactamente 6', async () => {
    const { solicitar, generar, aprobar, consultar, mazos, cola, publisher } = montar()
    await solicitar.execute(solicitud())
    await generar.execute({ _tag: 'GenerarMazo', mazoId: cola.encolados[0]! })

    const mazoId = cola.encolados[0]!
    const mazo = await mazos.porId(UniqueId.desde(mazoId))
    for (const tarjeta of mazo!.tarjetas.slice(0, 6)) {
      const r = await aprobar.execute({
        _tag: 'AprobarTarjeta',
        mazoId,
        tarjetaId: tarjeta.id,
        revisorId: ADMIN,
      })
      expect(r.ok).toBe(true)
    }

    const r = await consultar.execute({ _tag: 'TarjetasDeTomo', tomoId: TOMO })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toHaveLength(6)

    const publicado = publisher.porTipo('flashcards.mazo-publicado.v1')
    expect(publicado).toHaveLength(1) // solo al pasar de EN_REVISION a PUBLICADO
    expect(validarContra('flashcards.mazo-publicado.v1', publicado[0]!.payload())).toEqual({
      valido: true,
    })
  })

  test('una tarjeta rechazada nunca llega al estudiante y exige motivo', async () => {
    const { solicitar, generar, aprobar, rechazar, consultar, mazos, cola } = montar()
    await solicitar.execute(solicitud())
    await generar.execute({ _tag: 'GenerarMazo', mazoId: cola.encolados[0]! })
    const mazoId = cola.encolados[0]!
    const mazo = await mazos.porId(UniqueId.desde(mazoId))

    await aprobar.execute({
      _tag: 'AprobarTarjeta',
      mazoId,
      tarjetaId: mazo!.tarjetas[0]!.id,
      revisorId: ADMIN,
    })

    const sinMotivo = await rechazar.execute({
      _tag: 'RechazarTarjeta',
      mazoId,
      tarjetaId: mazo!.tarjetas[1]!.id,
      revisorId: ADMIN,
      motivo: '   ',
    })
    expect(sinMotivo.ok).toBe(false)
    if (!sinMotivo.ok) expect(sinMotivo.error.code).toBe('MOTIVO_REQUERIDO')

    await rechazar.execute({
      _tag: 'RechazarTarjeta',
      mazoId,
      tarjetaId: mazo!.tarjetas[1]!.id,
      revisorId: ADMIN,
      motivo: 'La respuesta inventa un método que no existe',
    })

    const r = await consultar.execute({ _tag: 'TarjetasDeTomo', tomoId: TOMO })
    if (r.ok) expect(r.value).toHaveLength(1)
  })

  test('aprobar con edición marca la tarjeta como editada (doc 10 §6)', async () => {
    const { solicitar, generar, aprobar, mazos, cola } = montar()
    await solicitar.execute(solicitud())
    await generar.execute({ _tag: 'GenerarMazo', mazoId: cola.encolados[0]! })
    const mazoId = cola.encolados[0]!
    const mazo = await mazos.porId(UniqueId.desde(mazoId))

    await aprobar.execute({
      _tag: 'AprobarTarjeta',
      mazoId,
      tarjetaId: mazo!.tarjetas[0]!.id,
      revisorId: ADMIN,
      edicion: { anverso: 'Pregunta corregida', reverso: 'Respuesta corregida' },
    })

    const actualizado = await mazos.porId(UniqueId.desde(mazoId))
    const tarjeta = actualizado!.tarjetas[0]!
    expect(tarjeta.editada).toBe(true)
    expect(tarjeta.anverso).toBe('Pregunta corregida')
  })
})

describe('Caché por hash (doc 10 §5)', () => {
  test('reemitir el evento con el MISMO hash no genera un mazo nuevo ni invoca al modelo', async () => {
    const { solicitar, generar, cola, generador, mazos } = montar()
    await solicitar.execute(solicitud())
    await generar.execute({ _tag: 'GenerarMazo', mazoId: cola.encolados[0]! })
    expect(generador.llamadas).toBe(1)

    // Editar una tilde en un título NO cambia el hash del contenido
    const segunda = await solicitar.execute(solicitud(HASH))
    expect(segunda.ok).toBe(true)
    if (segunda.ok) expect(segunda.value.desdeCache).toBe(true)

    expect(cola.encolados).toHaveLength(1)
    expect(mazos.mazos.size).toBe(1)
    expect(generador.llamadas).toBe(1) // no hubo segunda invocación
  })

  test('un hash distinto crea la versión N+1 y el mazo anterior sigue publicado', async () => {
    const { solicitar, generar, aprobar, consultar, mazos, cola } = montar()
    await solicitar.execute(solicitud())
    await generar.execute({ _tag: 'GenerarMazo', mazoId: cola.encolados[0]! })
    const v1 = await mazos.porId(UniqueId.desde(cola.encolados[0]!))
    await aprobar.execute({
      _tag: 'AprobarTarjeta',
      mazoId: v1!.id.valor,
      tarjetaId: v1!.tarjetas[0]!.id,
      revisorId: ADMIN,
    })

    const nueva = await solicitar.execute(solicitud('hash-contenido-editado'))
    expect(nueva.ok).toBe(true)
    if (nueva.ok) expect(nueva.value.desdeCache).toBe(false)
    const v2 = await mazos.porId(UniqueId.desde(cola.encolados[1]!))
    expect(v2!.version).toBe(2)
    expect(v2!.estado).toBe('GENERANDO')

    // El estudiante no se queda sin flashcards mientras el nuevo mazo se revisa
    const r = await consultar.execute({ _tag: 'TarjetasDeTomo', tomoId: TOMO })
    if (r.ok) expect(r.value).toHaveLength(1)
  })
})

describe('Fallos de generación (doc 10 §7)', () => {
  test('tras 3 intentos fallidos el mazo queda FALLIDO y emite generacion-fallida', async () => {
    const generador = new GeneradorQueFalla()
    const { solicitar, generar, mazos, cola, publisher } = montar(generador)
    await solicitar.execute(solicitud())
    const mazoId = cola.encolados[0]!

    for (let i = 0; i < 3; i++) {
      await generar.execute({ _tag: 'GenerarMazo', mazoId })
    }

    const mazo = await mazos.porId(UniqueId.desde(mazoId))
    expect(mazo!.intentos).toBe(3)
    expect(mazo!.estado).toBe('FALLIDO')
    const evento = publisher.porTipo('flashcards.generacion-fallida.v1')[0]
    expect(validarContra('flashcards.generacion-fallida.v1', evento!.payload())).toEqual({
      valido: true,
    })
  })

  test('una salida con menos de 8 tarjetas válidas no se acepta', async () => {
    const { solicitar, generar, mazos, cola } = montar(new GeneradorDePrueba(3))
    await solicitar.execute(solicitud())
    await generar.execute({ _tag: 'GenerarMazo', mazoId: cola.encolados[0]! })
    const mazo = await mazos.porId(UniqueId.desde(cola.encolados[0]!))
    expect(mazo!.estado).toBe('GENERANDO') // sigue reintentable, no publicó basura
    expect(mazo!.tarjetas).toHaveLength(0)
  })
})
