import type { DomainEvent } from '../domain-event.base'
import type { IEventPublisher } from '../event-publisher.port'

export class InMemoryEventPublisher implements IEventPublisher {
  readonly publicados: DomainEvent[] = []

  async publish(events: DomainEvent[]): Promise<void> {
    this.publicados.push(...events)
  }

  porTipo(eventType: string): DomainEvent[] {
    return this.publicados.filter(e => e.eventType === eventType)
  }

  limpiar(): void {
    this.publicados.length = 0
  }
}
