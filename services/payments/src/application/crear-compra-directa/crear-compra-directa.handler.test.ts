import { describe, expect, test } from 'bun:test'
import { FakeClock, UniqueId } from '@edtech/shared-kernel'
import { InMemoryEventPublisher } from '@edtech/shared-kernel/testing'
import { InMemoryOrdenRepository, InMemoryPrecioRepository } from '../dobles'
import { CrearCompraDirectaHandler } from './crear-compra-directa.handler'

describe('compra directa sin pasarela', () => {
  test('confirma la compra, deja acceso para matrícula y emite el evento referido', async () => {
    const usuarioId = crypto.randomUUID()
    const cursoId = crypto.randomUUID()
    const afiliadoId = crypto.randomUUID()
    const ordenes = new InMemoryOrdenRepository()
    const precios = new InMemoryPrecioRepository()
    const publisher = new InMemoryEventPublisher()
    const reloj = new FakeClock(new Date('2026-10-11T12:00:00Z'))
    precios.precios.set(cursoId, {
      cursoId,
      titulo: 'Curso de prueba',
      monto: 40,
      moneda: 'USD',
      versionPrecio: 1,
      publicado: true,
    })
    const handler = new CrearCompraDirectaHandler(ordenes, precios, publisher, reloj, {
      verificar: async (_prueba, compradorId) => ({
        ok: true,
        value: {
          afiliadoId,
          afiliadoUsuarioId: crypto.randomUUID(),
          visitaId: crypto.randomUUID(),
          refId: 'ref-demo',
          compradorId,
          politica: 'ultimo-referido-30d-v1',
          tasaBps: 500,
        },
      }),
    })

    const result = await handler.execute({
      _tag: 'CrearCompraDirecta',
      usuarioId,
      cursoId,
      pruebaAtribucion: 'atribucion-firmada',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.estado).toBe('CAPTURADA')
    expect(result.value.monto).toBe(40)
    const order = await ordenes.porId(UniqueId.desde(result.value.ordenId))
    expect(order?.estado).toBe('CAPTURADA')
    expect(order?.comision?.monto).toBe(0)
    expect(order?.neto?.monto).toBe(40)
    expect(order?.paypalCaptureId).toContain('DIRECT-')
    expect(publisher.porTipo('payments.pago-confirmado.v1')).toHaveLength(1)
    expect(publisher.porTipo('payments.venta-referida-confirmada.v1')).toHaveLength(1)
  })

  test('no permite registrar una segunda compra de un curso ya adquirido', async () => {
    const usuarioId = crypto.randomUUID()
    const cursoId = crypto.randomUUID()
    const ordenes = new InMemoryOrdenRepository()
    const precios = new InMemoryPrecioRepository()
    precios.precios.set(cursoId, {
      cursoId,
      titulo: 'Curso de prueba',
      monto: 40,
      moneda: 'USD',
      versionPrecio: 1,
      publicado: true,
    })
    const handler = new CrearCompraDirectaHandler(
      ordenes,
      precios,
      new InMemoryEventPublisher(),
      new FakeClock(new Date('2026-10-11T12:00:00Z')),
    )
    const command = { _tag: 'CrearCompraDirecta' as const, usuarioId, cursoId }

    expect((await handler.execute(command)).ok).toBe(true)
    const duplicate = await handler.execute(command)
    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok) expect(duplicate.error.code).toBe('YA_COMPRADO')
  })
})
