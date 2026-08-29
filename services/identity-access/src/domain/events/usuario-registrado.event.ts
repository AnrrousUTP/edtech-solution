import { DomainEvent } from '@edtech/shared-kernel'

export class UsuarioRegistradoEvent extends DomainEvent {
  readonly eventType = 'identity.usuario-registrado.v1'

  constructor(
    readonly aggregateId: string,
    private readonly email: string,
    private readonly nombreVisible: string,
    private readonly rol: string,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      usuarioId: this.aggregateId,
      email: this.email,
      nombreVisible: this.nombreVisible,
      rol: this.rol,
    }
  }
}
