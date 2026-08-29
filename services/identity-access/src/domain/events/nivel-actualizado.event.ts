import { DomainEvent } from '@edtech/shared-kernel'

export class NivelActualizadoEvent extends DomainEvent {
  readonly eventType = 'identity.nivel-actualizado.v1'

  constructor(
    readonly aggregateId: string,
    private readonly nivelAnterior: string,
    private readonly nivelNuevo: string,
    private readonly origen: string,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      usuarioId: this.aggregateId,
      nivelAnterior: this.nivelAnterior,
      nivelNuevo: this.nivelNuevo,
      origen: this.origen,
    }
  }
}
