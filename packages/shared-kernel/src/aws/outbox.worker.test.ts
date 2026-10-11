import { expect, test } from 'bun:test'
import type { DomainEvent } from '../domain-event.base'
import { OutboxWorker, type OutboxRow } from './outbox.worker'
test('una caída de transporte conserva el evento y el reintento mantiene su identidad', async () => {
  const row: OutboxRow = {
    event_id: crypto.randomUUID(),
    event_type: 'payments.pago-confirmado.v1',
    aggregate_id: crypto.randomUUID(),
    payload: {},
    creado_at: new Date(),
  }
  let published = false,
    fallar = true
  const sent: string[] = []
  const worker = new OutboxWorker(
    {
      pendientes: async () => (published ? [] : [row]),
      publicado: async () => {
        published = true
      },
    },
    {
      publish: async (events: DomainEvent[]) => {
        sent.push(events[0]!.eventId)
        if (fallar) throw new Error('transporte temporalmente caído')
      },
    },
  )
  await worker.flush()
  expect(published).toBe(false)
  fallar = false
  await worker.flush()
  expect(published).toBe(true)
  expect(sent).toEqual([row.event_id, row.event_id])
})
