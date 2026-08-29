import { DomainEvent } from '@edtech/shared-kernel'

export class MatriculaCreadaEvent extends DomainEvent {
  readonly eventType = 'enrollment.matricula-creada.v1'

  constructor(
    readonly aggregateId: string, // matriculaId
    private readonly usuarioId: string,
    private readonly cursoId: string,
    private readonly origen: string,
    private readonly ordenId: string | null,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      matriculaId: this.aggregateId,
      usuarioId: this.usuarioId,
      cursoId: this.cursoId,
      origen: this.origen,
      ...(this.ordenId ? { ordenId: this.ordenId } : {}),
    }
  }
}
