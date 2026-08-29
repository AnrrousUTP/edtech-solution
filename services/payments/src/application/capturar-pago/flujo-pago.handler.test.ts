import { describe, expect, test } from 'bun:test'
import { CommandBus, FakeClock, UniqueId, validarContra } from '@edtech/shared-kernel'
import { InMemoryEventPublisher } from '@edtech/shared-kernel/testing'
import { CapturarPagoHandler } from './capturar-pago.handler'
import { CrearOrdenHandler } from '../crear-orden/crear-orden.handler'
import { ProcesarWebhookHandler } from '../procesar-webhook/procesar-webhook.handler'
import { ExpirarOrdenesHandler } from '../consultar-ordenes/consultar-ordenes.handler'
import {
  FakePasarela,
  InMemoryOrdenRepository,
  InMemoryPrecioRepository,
  InMemoryWebhookRepository,
} from '../dobles'

const USUARIO = crypto.randomUUID()
const CURSO = crypto.randomUUID()

const montar = (fecha = new Date('2026-08-28T12:00:00Z')) => {
  const ordenes = new InMemoryOrdenRepository()
  const precios = new InMemoryPrecioRepository()
  const webhooks = new InMemoryWebhookRepository()
  const publisher = new InMemoryEventPublisher()
  const pasarela = new FakePasarela()
  const reloj = new FakeClock(fecha)
  const bus = new CommandBus()

  precios.precios.set(CURSO, {
    cursoId: CURSO,
    titulo: 'CSS desde Cero',
    monto: 19.9,
    moneda: 'USD',
    versionPrecio: 1,
    publicado: true,
  })

  const crear = new CrearOrdenHandler(ordenes, precios, pasarela, publisher, reloj)
  const capturar = new CapturarPagoHandler(ordenes, pasarela, publisher, reloj)
  const webhook = new ProcesarWebhookHandler(ordenes, webhooks, publisher, reloj, () => bus)
  bus.register(crear)
  bus.register(capturar)
  bus.register(webhook)

  return { ordenes, precios, webhooks, publisher, pasarela, reloj, bus, crear, capturar, webhook }
}

const crearOrden = {
  _tag: 'CrearOrden' as const,
  usuarioId: USUARIO,
  cursoId: CURSO,
  urlRetorno: 'https://app/retorno',
  urlCancelacion: 'https://app/cancelado',
}

describe('Flujo de compra (doc 09 §2)', () => {
  test('crear orden congela el monto y devuelve la URL de aprobación', async () => {
    const { crear, publisher } = montar()
    const r = await crear.execute(crearOrden)

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.monto).toBe(19.9)
      expect(r.value.urlAprobacion).toContain('paypal.com')
    }
    const evento = publisher.porTipo('payments.orden-creada.v1')[0]
    expect(validarContra('payments.orden-creada.v1', evento!.payload())).toEqual({ valido: true })
  })

  test('capturar emite pago-confirmado con contrato válido y guarda comisión y neto', async () => {
    const { crear, capturar, ordenes, publisher } = montar()
    const creada = await crear.execute(crearOrden)
    if (!creada.ok) throw creada.error

    const r = await capturar.execute({
      _tag: 'CapturarPago',
      ordenId: creada.value.ordenId,
      usuarioId: USUARIO,
    })

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.estado).toBe('CAPTURADA')

    const orden = await ordenes.porId(UniqueId.desde(creada.value.ordenId))
    expect(orden!.comision!.monto).toBe(1.37)
    expect(orden!.neto!.monto).toBe(18.53)

    const evento = publisher.porTipo('payments.pago-confirmado.v1')[0]
    expect(validarContra('payments.pago-confirmado.v1', evento!.payload())).toEqual({
      valido: true,
    })
  })

  test('doble clic en Pagar reutiliza la orden PENDIENTE (doc 09 §8)', async () => {
    const { crear, ordenes } = montar()
    const primera = await crear.execute(crearOrden)
    const segunda = await crear.execute(crearOrden)

    expect(primera.ok && segunda.ok).toBe(true)
    if (primera.ok && segunda.ok) {
      expect(segunda.value.ordenId).toBe(primera.value.ordenId)
      expect(segunda.value.reutilizada).toBe(true)
    }
    expect(ordenes.ordenes.size).toBe(1)
  })

  test('comprar un curso ya comprado devuelve 409 antes de crear la orden', async () => {
    const { crear, capturar } = montar()
    const creada = await crear.execute(crearOrden)
    if (!creada.ok) throw creada.error
    await capturar.execute({
      _tag: 'CapturarPago',
      ordenId: creada.value.ordenId,
      usuarioId: USUARIO,
    })

    const otra = await crear.execute(crearOrden)
    expect(otra.ok).toBe(false)
    if (!otra.ok) expect(otra.error.code).toBe('YA_COMPRADO')
  })

  test('un curso gratuito no pasa por PayPal', async () => {
    const { crear, precios } = montar()
    precios.precios.set(CURSO, {
      cursoId: CURSO,
      titulo: 'HTML Esencial',
      monto: 0,
      moneda: 'USD',
      versionPrecio: 1,
      publicado: true,
    })
    const r = await crear.execute(crearOrden)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('CURSO_GRATUITO')
  })

  test('un curso despublicado no admite compra', async () => {
    const { crear, precios } = montar()
    await precios.marcarPublicado(CURSO, false)
    const r = await crear.execute(crearOrden)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('CURSO_NO_DISPONIBLE')
  })

  test('capturar la orden de otro usuario devuelve 403', async () => {
    const { crear, capturar } = montar()
    const creada = await crear.execute(crearOrden)
    if (!creada.ok) throw creada.error
    const r = await capturar.execute({
      _tag: 'CapturarPago',
      ordenId: creada.value.ordenId,
      usuarioId: crypto.randomUUID(),
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('ORDEN_AJENA')
  })

  test('una captura DENEGADA marca la orden FALLIDA y emite pago-fallido', async () => {
    const { crear, capturar, pasarela, publisher } = montar()
    const creada = await crear.execute(crearOrden)
    if (!creada.ok) throw creada.error
    pasarela.estadoCaptura = 'DENEGADA'

    const r = await capturar.execute({
      _tag: 'CapturarPago',
      ordenId: creada.value.ordenId,
      usuarioId: USUARIO,
    })
    expect(r.ok).toBe(true)
    const evento = publisher.porTipo('payments.pago-fallido.v1')[0]
    expect(validarContra('payments.pago-fallido.v1', evento!.payload())).toEqual({ valido: true })
    expect(publisher.porTipo('payments.pago-confirmado.v1')).toHaveLength(0)
  })
})

describe('Idempotencia doble (doc 09 §4)', () => {
  test('capturar dos veces emite pago-confirmado UNA sola vez', async () => {
    const { crear, capturar, publisher } = montar()
    const creada = await crear.execute(crearOrden)
    if (!creada.ok) throw creada.error
    const cmd = {
      _tag: 'CapturarPago' as const,
      ordenId: creada.value.ordenId,
      usuarioId: USUARIO,
    }

    await capturar.execute(cmd)
    const segunda = await capturar.execute(cmd)

    expect(segunda.ok).toBe(true)
    if (segunda.ok) expect(segunda.value.yaEstabaCapturada).toBe(true)
    expect(publisher.porTipo('payments.pago-confirmado.v1')).toHaveLength(1)
  })

  test('el webhook tras la captura síncrona NO re-emite pago-confirmado', async () => {
    const { crear, capturar, webhook, publisher, ordenes } = montar()
    const creada = await crear.execute(crearOrden)
    if (!creada.ok) throw creada.error
    await capturar.execute({
      _tag: 'CapturarPago',
      ordenId: creada.value.ordenId,
      usuarioId: USUARIO,
    })
    const orden = await ordenes.porId(UniqueId.desde(creada.value.ordenId))

    const r = await webhook.execute({
      _tag: 'ProcesarWebhook',
      paypalEventId: 'WH-1',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      recurso: { id: orden!.paypalCaptureId, custom_id: creada.value.ordenId },
    })

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.efecto).toBe('ya-confirmado')
    expect(publisher.porTipo('payments.pago-confirmado.v1')).toHaveLength(1)
  })

  test('si el usuario cierra el navegador, el webhook completa la compra igual', async () => {
    const { crear, webhook, publisher } = montar()
    const creada = await crear.execute(crearOrden)
    if (!creada.ok) throw creada.error

    // No hubo captura síncrona: el webhook la confirma
    const r = await webhook.execute({
      _tag: 'ProcesarWebhook',
      paypalEventId: 'WH-2',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      recurso: {
        id: 'CAP-EXTERNA',
        custom_id: creada.value.ordenId,
        seller_receivable_breakdown: {
          paypal_fee: { value: '1.37', currency_code: 'USD' },
          net_amount: { value: '18.53', currency_code: 'USD' },
        },
      },
    })

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.efecto).toBe('pago-confirmado')
    expect(publisher.porTipo('payments.pago-confirmado.v1')).toHaveLength(1)
  })

  test('un reembolso emite pago-reembolsado una sola vez', async () => {
    const { crear, capturar, webhook, publisher, ordenes } = montar()
    const creada = await crear.execute(crearOrden)
    if (!creada.ok) throw creada.error
    await capturar.execute({
      _tag: 'CapturarPago',
      ordenId: creada.value.ordenId,
      usuarioId: USUARIO,
    })
    const orden = await ordenes.porId(UniqueId.desde(creada.value.ordenId))

    const recurso = {
      id: 'REF-1',
      custom_id: creada.value.ordenId,
      amount: { value: '19.90', currency_code: 'USD' },
      links: [{ rel: 'up', href: `https://api/v2/payments/captures/${orden!.paypalCaptureId}` }],
    }
    const primera = await webhook.execute({
      _tag: 'ProcesarWebhook',
      paypalEventId: 'WH-3',
      eventType: 'PAYMENT.CAPTURE.REFUNDED',
      recurso,
    })
    const segunda = await webhook.execute({
      _tag: 'ProcesarWebhook',
      paypalEventId: 'WH-4',
      eventType: 'PAYMENT.CAPTURE.REFUNDED',
      recurso,
    })

    expect(primera.ok && segunda.ok).toBe(true)
    if (segunda.ok) expect(segunda.value.efecto).toBe('ya-reembolsado')
    const evento = publisher.porTipo('payments.pago-reembolsado.v1')[0]
    expect(validarContra('payments.pago-reembolsado.v1', evento!.payload())).toEqual({
      valido: true,
    })
    expect(publisher.porTipo('payments.pago-reembolsado.v1')).toHaveLength(1)
  })
})

describe('Casos borde (doc 09 §8)', () => {
  test('una orden PENDIENTE de más de 24 h expira', async () => {
    const reloj = new FakeClock(new Date('2026-08-28T12:00:00Z'))
    const { crear, ordenes } = montar(reloj.ahora())
    const creada = await crear.execute(crearOrden)
    if (!creada.ok) throw creada.error

    const despues = new Date('2026-08-29T13:00:00Z')
    const expirar = new ExpirarOrdenesHandler(ordenes, () => despues)
    const r = await expirar.execute()

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.expiradas).toBe(1)
    const orden = await ordenes.porId(UniqueId.desde(creada.value.ordenId))
    expect(orden!.estado).toBe('EXPIRADA')
  })

  test('una orden expirada no se puede capturar', async () => {
    const { crear, ordenes, pasarela, publisher } = montar()
    const creada = await crear.execute(crearOrden)
    if (!creada.ok) throw creada.error

    const despues = new FakeClock(new Date('2026-08-30T12:00:00Z'))
    const capturarTarde = new CapturarPagoHandler(ordenes, pasarela, publisher, despues)
    const r = await capturarTarde.execute({
      _tag: 'CapturarPago',
      ordenId: creada.value.ordenId,
      usuarioId: USUARIO,
    })

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('ORDEN_EXPIRADA')
  })

  test('si PayPal falla al crear la orden, no queda orden a medias', async () => {
    const { crear, pasarela, ordenes, publisher } = montar()
    pasarela.fallarCrear = true
    const r = await crear.execute(crearOrden)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('PASARELA_ERROR')
    expect(ordenes.ordenes.size).toBe(0)
    expect(publisher.publicados).toHaveLength(0)
  })

  test('el precio congelado no cambia aunque cambie la proyección', async () => {
    const { crear, capturar, precios, ordenes } = montar()
    const creada = await crear.execute(crearOrden)
    if (!creada.ok) throw creada.error

    await precios.guardar({
      cursoId: CURSO,
      titulo: 'CSS desde Cero',
      monto: 49.9,
      moneda: 'USD',
      versionPrecio: 2,
      publicado: true,
    })
    await capturar.execute({
      _tag: 'CapturarPago',
      ordenId: creada.value.ordenId,
      usuarioId: USUARIO,
    })

    const orden = await ordenes.porId(UniqueId.desde(creada.value.ordenId))
    expect(orden!.monto.monto).toBe(19.9) // el monto congelado, no el nuevo
    expect(orden!.versionPrecio).toBe(1) // rastro para conciliar
  })
})
