import { DomainEvent } from '@edtech/shared-kernel'

export class MazoPublicadoEvent extends DomainEvent {
  readonly eventType = 'flashcards.mazo-publicado.v1'

  constructor(
    readonly aggregateId: string, // mazoId
    private readonly tomoId: string,
    private readonly cursoId: string,
    private readonly version: number,
    private readonly cantidadPublicadas: number,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      mazoId: this.aggregateId,
      tomoId: this.tomoId,
      cursoId: this.cursoId,
      version: this.version,
      cantidadPublicadas: this.cantidadPublicadas,
    }
  }
}
