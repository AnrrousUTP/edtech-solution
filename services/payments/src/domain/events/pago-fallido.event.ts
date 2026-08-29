import { DomainEvent } from '@edtech/shared-kernel'

export class PagoFallidoEvent extends DomainEvent {
  readonly eventType = 'payments.pago-fallido.v1'

  constructor(
    readonly aggregateId: string,
    private readonly usuarioId: string,
    private readonly cursoId: string,
    private readonly motivo: string,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      ordenId: this.aggregateId,
      usuarioId: this.usuarioId,
      cursoId: this.cursoId,
      motivo: this.motivo,
    }
  }
}
