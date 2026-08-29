import { DomainEvent } from '@edtech/shared-kernel'

export class CarreraCompletadaEvent extends DomainEvent {
  readonly eventType = 'enrollment.carrera-completada.v1'

  constructor(
    readonly aggregateId: string, // usuarioId (no hay agregado carrera en enrollment)
    private readonly carreraId: string,
    private readonly carreraTitulo: string,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      usuarioId: this.aggregateId,
      carreraId: this.carreraId,
      carreraTitulo: this.carreraTitulo,
    }
  }
}
