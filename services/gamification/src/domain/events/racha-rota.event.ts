import { DomainEvent } from '@edtech/shared-kernel'

export class RachaRotaEvent extends DomainEvent {
  readonly eventType = 'gamification.racha-rota.v1'

  constructor(
    readonly aggregateId: string, // usuarioId
    private readonly rachaPerdida: number,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return { usuarioId: this.aggregateId, rachaPerdida: this.rachaPerdida }
  }
}
