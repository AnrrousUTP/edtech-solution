import { DomainEvent } from '@edtech/shared-kernel'

export class RachaExtendidaEvent extends DomainEvent {
  readonly eventType = 'gamification.racha-extendida.v1'

  constructor(
    readonly aggregateId: string, // usuarioId
    private readonly rachaActual: number,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return { usuarioId: this.aggregateId, rachaActual: this.rachaActual }
  }
}
