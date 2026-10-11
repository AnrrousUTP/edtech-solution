import { expect, test } from 'bun:test'
import { UniqueId, validarContra } from '@edtech/shared-kernel'
import { Orden } from './orden.entity'
import { Dinero } from '../value-objects/dinero.vo'
const crear = () => {
  const buyer = UniqueId.nuevo()
  return Orden.crear({
    usuarioId: buyer,
    cursoId: UniqueId.nuevo(),
    cursoTitulo: 'Python Aplicado',
    monto: Dinero.desdeCentavos(4000, 'USD'),
    versionPrecio: 1,
    ahora: new Date(),
    expiraAt: new Date(Date.now() + 86400000),
    atribucion: {
      afiliadoId: crypto.randomUUID(),
      afiliadoUsuarioId: crypto.randomUUID(),
      visitaId: crypto.randomUUID(),
      refId: 'a'.repeat(36),
      compradorId: buyer.valor,
      politica: 'ultimo-referido-30d-v1',
      tasaBps: 500,
    },
  })
}
test('venta referida solo se emite al confirmar captura y una vez', () => {
  const o = crear()
  expect(o.pullEvents().some(e => e.eventType.includes('venta-referida'))).toBe(false)
  const datos = {
    capturaId: 'LOCAL-CAPTURE',
    comision: Dinero.desdeCentavos(0, 'USD'),
    neto: o.monto,
    ahora: new Date(),
  }
  o.confirmarCaptura(datos)
  const events = o.pullEvents(),
    sale = events.find(e => e.eventType === 'payments.venta-referida-confirmada.v1')!
  expect(events.some(e => e.eventType === 'payments.pago-confirmado.v1')).toBe(true)
  expect(validarContra(sale.eventType, sale.payload()).valido).toBe(true)
  expect(sale.payload().baseCentavos).toBe(4000)
  o.confirmarCaptura(datos)
  expect(o.pullEvents()).toHaveLength(0)
})
test('reembolsos parciales distintos se emiten y un duplicado se ignora', () => {
  const o = crear()
  o.confirmarCaptura({
    capturaId: 'cap',
    comision: Dinero.desdeCentavos(0, 'USD'),
    neto: o.monto,
    ahora: new Date(),
  })
  o.pullEvents()
  expect(o.registrarReembolso('refund-1', Dinero.desdeCentavos(1000, 'USD'))).toBe(true)
  expect(o.estado).toBe('CAPTURADA')
  expect(o.registrarReembolso('refund-1', Dinero.desdeCentavos(1000, 'USD'))).toBe(false)
  expect(o.registrarReembolso('refund-2', Dinero.desdeCentavos(3000, 'USD'))).toBe(true)
  expect(o.estado).toBe('REEMBOLSADA')
  expect(o.pullEvents()).toHaveLength(2)
})
