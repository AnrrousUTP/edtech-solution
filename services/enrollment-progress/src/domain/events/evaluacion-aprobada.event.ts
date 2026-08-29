import { DomainEvent } from '@edtech/shared-kernel'

export class EvaluacionAprobadaEvent extends DomainEvent {
  readonly eventType = 'enrollment.evaluacion-aprobada.v1'

  constructor(
    readonly aggregateId: string, // intentoId
    private readonly usuarioId: string,
    private readonly tomoId: string,
    private readonly puntaje: number,
    private readonly perfecto: boolean,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      usuarioId: this.usuarioId,
      intentoId: this.aggregateId,
      tomoId: this.tomoId,
      puntaje: this.puntaje,
      perfecto: this.perfecto,
    }
  }
}
