import { DomainEvent } from '@edtech/shared-kernel'
export class ComisionRegistradaEvent extends DomainEvent {
  readonly eventType = 'affiliates.comision-registrada.v1'
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
