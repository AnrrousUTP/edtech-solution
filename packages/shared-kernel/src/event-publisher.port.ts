import type { DomainEvent } from './domain-event.base'

export interface IEventPublisher {
  publish(events: DomainEvent[]): Promise<void>
}
