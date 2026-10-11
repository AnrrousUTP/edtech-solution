import type { DomainEvent } from '../domain-event.base'
import type { IEventPublisher } from '../event-publisher.port'
import { log } from '../logger'
export type OutboxRow = {
  event_id: string
  event_type: string
  aggregate_id: string
  payload: Record<string, unknown>
  creado_at: Date
}
export interface OutboxStorage {
  pendientes(): Promise<OutboxRow[]>
  publicado(eventId: string): Promise<void>
}
/** Transporte al menos una vez; consumidores idempotentes. Un flush a la vez por proceso. */
export class OutboxWorker {
  private ocupado = false
  constructor(
    private readonly storage: OutboxStorage,
    private readonly publisher: IEventPublisher,
  ) {}
  async flush(): Promise<void> {
    if (this.ocupado) return
    this.ocupado = true
    try {
      for (const r of await this.storage.pendientes()) {
        const event: DomainEvent = {
          eventId: r.event_id,
          eventType: r.event_type,
          aggregateId: r.aggregate_id,
          occurredAt: new Date(r.creado_at),
          payload: () => r.payload,
        }
        await this.publisher.publish([event])
        await this.storage.publicado(r.event_id)
      }
    } catch (error) {
      log.error('outbox pendiente; se reintentará', { error: String(error) })
    } finally {
      this.ocupado = false
    }
  }
}
