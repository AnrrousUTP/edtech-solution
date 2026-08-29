import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge'
import type { DomainEvent } from '../domain-event.base'
import type { IEventPublisher } from '../event-publisher.port'
import { correlationIdActual } from '../http/request-context'
import { log } from '../logger'

// Publica el sobre del doc 05 §3: DetailType = eventType, Source = edtech.<contexto>.
export class EventBridgePublisher implements IEventPublisher {
  constructor(
    private readonly cliente: EventBridgeClient,
    private readonly busName: string,
  ) {}

  async publish(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return
    // PutEvents admite 10 entradas por llamada
    for (let i = 0; i < events.length; i += 10) {
      const lote = events.slice(i, i + 10)
      const entradas = lote.map(e => ({
        EventBusName: this.busName,
        Source: `edtech.${e.eventType.split('.')[0]}`,
        DetailType: e.eventType,
        Detail: JSON.stringify({
          eventId: e.eventId,
          eventType: e.eventType,
          occurredAt: e.occurredAt.toISOString(),
          aggregateId: e.aggregateId,
          correlationId: correlationIdActual(),
          payload: e.payload(),
        }),
      }))
      const respuesta = await this.cliente.send(new PutEventsCommand({ Entries: entradas }))
      if (respuesta.FailedEntryCount && respuesta.FailedEntryCount > 0) {
        const fallidas = (respuesta.Entries ?? []).filter(en => en.ErrorCode)
        log.error('PutEvents con entradas fallidas', {
          fallidas: fallidas.map(f => ({ code: f.ErrorCode, msg: f.ErrorMessage })),
        })
        throw new Error(`EventBridge rechazó ${respuesta.FailedEntryCount} evento(s)`)
      }
    }
  }
}

export const crearEventBridgeClient = (config: {
  region: string
  endpoint?: string
}): EventBridgeClient =>
  new EventBridgeClient({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  })
