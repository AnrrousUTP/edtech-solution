import { DomainEvent } from '@edtech/shared-kernel'

export class PrecioActualizadoEvent extends DomainEvent {
  readonly eventType = 'catalog.precio-actualizado.v1'

  constructor(
    readonly aggregateId: string,
    private readonly datos: {
      montoAnterior: number
      montoNuevo: number
      moneda: string
      versionPrecio: number
    },
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return { cursoId: this.aggregateId, ...this.datos }
  }
}
