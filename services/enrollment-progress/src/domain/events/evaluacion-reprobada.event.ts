import { DomainEvent } from '@edtech/shared-kernel'

export class EvaluacionReprobadaEvent extends DomainEvent {
  readonly eventType = 'enrollment.evaluacion-reprobada.v1'

  constructor(
    readonly aggregateId: string, // intentoId
    private readonly usuarioId: string,
    private readonly tomoId: string,
    private readonly puntaje: number,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      usuarioId: this.usuarioId,
      intentoId: this.aggregateId,
      tomoId: this.tomoId,
      puntaje: this.puntaje,
    }
  }
}
