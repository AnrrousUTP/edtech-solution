import { DomainEvent } from '@edtech/shared-kernel'

export class CursoCompletadoEvent extends DomainEvent {
  readonly eventType = 'enrollment.curso-completado.v1'

  constructor(
    readonly aggregateId: string, // matriculaId
    private readonly usuarioId: string,
    private readonly cursoId: string,
    private readonly cursoTitulo: string, // viaja en el evento a propósito (doc 05 §2.3)
    private readonly completadoAt: Date,
    private readonly nivelMax: string | null, // campo opcional A-11
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      matriculaId: this.aggregateId,
      usuarioId: this.usuarioId,
      cursoId: this.cursoId,
      cursoTitulo: this.cursoTitulo,
      completadoAt: this.completadoAt.toISOString(),
      ...(this.nivelMax ? { nivelMax: this.nivelMax } : {}),
    }
  }
}
