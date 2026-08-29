import { DomainEvent } from '@edtech/shared-kernel'

export class LeccionCompletadaEvent extends DomainEvent {
  readonly eventType = 'enrollment.leccion-completada.v1'

  constructor(
    readonly aggregateId: string, // matriculaId
    private readonly usuarioId: string,
    private readonly cursoId: string,
    private readonly tomoId: string,
    private readonly leccionId: string,
    private readonly completadaAt: Date,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      matriculaId: this.aggregateId,
      usuarioId: this.usuarioId,
      cursoId: this.cursoId,
      tomoId: this.tomoId,
      leccionId: this.leccionId,
      completadaAt: this.completadaAt.toISOString(),
    }
  }
}
