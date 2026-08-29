export abstract class DomainEvent {
  readonly eventId: string = crypto.randomUUID()
  readonly occurredAt: Date = new Date()
  abstract readonly eventType: string // 'enrollment.tomo-completado.v1'
  abstract readonly aggregateId: string
  abstract payload(): Record<string, unknown>
}

export abstract class AggregateRoot {
  #events: DomainEvent[] = []
  protected record(e: DomainEvent): void {
    this.#events.push(e)
  }
  pullEvents(): DomainEvent[] {
    const e = this.#events
    this.#events = []
    return e
  }
}
