import { DomainEvent } from '@edtech/shared-kernel'

export class MazoGeneradoEvent extends DomainEvent {
  readonly eventType = 'flashcards.mazo-generado.v1'

  constructor(
    readonly aggregateId: string, // mazoId
    private readonly tomoId: string,
    private readonly cursoId: string,
    private readonly version: number,
    private readonly cantidadTarjetas: number,
    private readonly modeloUsado: string,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      mazoId: this.aggregateId,
      tomoId: this.tomoId,
      cursoId: this.cursoId,
      version: this.version,
      cantidadTarjetas: this.cantidadTarjetas,
      modeloUsado: this.modeloUsado,
    }
  }
}
