import { DomainEvent } from '@edtech/shared-kernel'

export class TomoCompletadoEvent extends DomainEvent {
  readonly eventType = 'enrollment.tomo-completado.v1'

  constructor(
    readonly aggregateId: string, // matriculaId
    private readonly usuarioId: string,
    private readonly cursoId: string,
    private readonly tomoId: string,
    private readonly puntaje: number,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      matriculaId: this.aggregateId,
      usuarioId: this.usuarioId,
      cursoId: this.cursoId,
      tomoId: this.tomoId,
      puntaje: this.puntaje,
    }
  }
}
