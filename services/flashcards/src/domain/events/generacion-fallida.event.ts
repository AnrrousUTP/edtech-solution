import { DomainEvent } from '@edtech/shared-kernel'

export class GeneracionFallidaEvent extends DomainEvent {
  readonly eventType = 'flashcards.generacion-fallida.v1'

  constructor(
    readonly aggregateId: string, // tomoId
    private readonly motivo: string,
    private readonly intentos: number,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return { tomoId: this.aggregateId, motivo: this.motivo, intentos: this.intentos }
  }
}
