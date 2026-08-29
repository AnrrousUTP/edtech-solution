import { DomainEvent } from '@edtech/shared-kernel'

export class PagoReembolsadoEvent extends DomainEvent {
  readonly eventType = 'payments.pago-reembolsado.v1'

  constructor(
    readonly aggregateId: string,
    private readonly usuarioId: string,
    private readonly cursoId: string,
    private readonly monto: number,
    private readonly reembolsoId: string,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      ordenId: this.aggregateId,
      usuarioId: this.usuarioId,
      cursoId: this.cursoId,
      monto: this.monto,
      reembolsoId: this.reembolsoId,
    }
  }
}
