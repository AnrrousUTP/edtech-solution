import { DomainEvent } from '@edtech/shared-kernel'
import type { AtribucionReferida } from '../ports-out/atribucion.port'
export class VentaReferidaConfirmadaEvent extends DomainEvent {
  readonly eventType = 'payments.venta-referida-confirmada.v1'
  constructor(
    readonly aggregateId: string,
    private readonly atribucion: AtribucionReferida,
    private readonly cursoId: string,
    private readonly cursoTitulo: string,
    private readonly baseCentavos: number,
    private readonly moneda: string,
    private readonly capturaId: string,
    private readonly confirmadoAt: Date,
  ) {
    super()
  }
  payload(): Record<string, unknown> {
    return {
      ...this.atribucion,
      ordenId: this.aggregateId,
      cursoId: this.cursoId,
      cursoTitulo: this.cursoTitulo,
      baseCentavos: this.baseCentavos,
      moneda: this.moneda,
      capturaId: this.capturaId,
      confirmadoAt: this.confirmadoAt.toISOString(),
    }
  }
}
