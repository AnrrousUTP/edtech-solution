import { DomainEvent } from '@edtech/shared-kernel'
export class AfiliadoActivadoEvent extends DomainEvent {
  readonly eventType = 'affiliates.afiliado-activado.v1'
  constructor(
    readonly aggregateId: string,
    private readonly datos: Record<string, unknown>,
  ) {
    super()
  }
  payload(): Record<string, unknown> {
    return this.datos
  }
}
