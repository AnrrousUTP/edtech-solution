import { DomainEvent } from '@edtech/shared-kernel'

export class InsigniaOtorgadaEvent extends DomainEvent {
  readonly eventType = 'gamification.insignia-otorgada.v1'

  constructor(
    readonly aggregateId: string, // usuarioId
    private readonly criterio: string,
    private readonly referenciaId: string,
    private readonly otorgadaAt: Date,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      usuarioId: this.aggregateId,
      criterio: this.criterio,
      referenciaId: this.referenciaId,
      otorgadaAt: this.otorgadaAt.toISOString(),
    }
  }
}
