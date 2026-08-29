import { DomainEvent } from '@edtech/shared-kernel'

export class TestNivelacionCompletadoEvent extends DomainEvent {
  readonly eventType = 'enrollment.test-nivelacion-completado.v1'

  constructor(
    readonly aggregateId: string, // intentoId
    private readonly usuarioId: string,
    private readonly nivelResultante: string,
    private readonly puntaje: number,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      usuarioId: this.usuarioId,
      intentoId: this.aggregateId,
      nivelResultante: this.nivelResultante,
      puntaje: this.puntaje,
    }
  }
}
