import { describe, expect, test } from 'bun:test'
import { parseSobre } from './sqs.poller'

const sobreValido = {
  eventId: crypto.randomUUID(),
  eventType: 'payments.pago-confirmado.v1',
  occurredAt: new Date().toISOString(),
  aggregateId: crypto.randomUUID(),
  correlationId: 'req-1',
  payload: { ordenId: crypto.randomUUID() },
}

describe('parseSobre', () => {
  test('acepta el sobre envuelto por EventBridge (detail)', () => {
    const r = parseSobre(
      JSON.stringify({ 'detail-type': sobreValido.eventType, detail: sobreValido }),
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.eventType).toBe('payments.pago-confirmado.v1')
  })

  test('acepta el sobre directo (colas internas)', () => {
    const r = parseSobre(JSON.stringify(sobreValido))
    expect(r.ok).toBe(true)
  })

  test('rechaza un body que no es JSON', () => {
    expect(parseSobre('esto no es json').ok).toBe(false)
  })

  test('rechaza un sobre sin eventId', () => {
    const { eventId: _omitido, ...sinEventId } = sobreValido
    expect(parseSobre(JSON.stringify(sinEventId)).ok).toBe(false)
  })
})
