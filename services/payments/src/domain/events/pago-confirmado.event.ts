import { DomainEvent } from '@edtech/shared-kernel'

/** El evento que habilita matrículas. Se emite SOLO tras captura confirmada
 *  por PayPal (doc 09 §4): emitirlo antes habilita cursos que no se pagaron. */
export class PagoConfirmadoEvent extends DomainEvent {
  readonly eventType = 'payments.pago-confirmado.v1'

  constructor(
    readonly aggregateId: string,
    private readonly usuarioId: string,
    private readonly cursoId: string,
    private readonly monto: number,
    private readonly moneda: string,
    private readonly capturaId: string,
    private readonly confirmadoAt: Date,
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
      capturaId: this.capturaId,
      confirmadoAt: this.confirmadoAt.toISOString(),
    }
  }
}
