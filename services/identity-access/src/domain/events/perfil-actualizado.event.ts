import { DomainEvent } from '@edtech/shared-kernel'

export class PerfilActualizadoEvent extends DomainEvent {
  readonly eventType = 'identity.perfil-actualizado.v1'

  constructor(
    readonly aggregateId: string,
    private readonly campos: string[],
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return { usuarioId: this.aggregateId, campos: this.campos }
  }
}
