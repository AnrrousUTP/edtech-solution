import { DomainEvent } from '@edtech/shared-kernel'

export class CursoDespublicadoEvent extends DomainEvent {
  readonly eventType = 'catalog.curso-despublicado.v1'

  constructor(
    readonly aggregateId: string,
    private readonly motivo: string,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return { cursoId: this.aggregateId, motivo: this.motivo }
  }
}
