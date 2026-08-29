import { DomainEvent } from '@edtech/shared-kernel'

export class OrdenCreadaEvent extends DomainEvent {
  readonly eventType = 'payments.orden-creada.v1'

  constructor(
    readonly aggregateId: string,
    private readonly usuarioId: string,
    private readonly cursoId: string,
    private readonly monto: number,
    private readonly moneda: string,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      ordenId: this.aggregateId,
      usuarioId: this.usuarioId,
      cursoId: this.cursoId,
      monto: this.monto,
      moneda: this.moneda,
    }
  }
}
