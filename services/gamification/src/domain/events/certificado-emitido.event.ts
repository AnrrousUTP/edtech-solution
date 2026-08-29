import { DomainEvent } from '@edtech/shared-kernel'

export class CertificadoEmitidoEvent extends DomainEvent {
  readonly eventType = 'gamification.certificado-emitido.v1'

  constructor(
    readonly aggregateId: string, // certificadoId
    private readonly usuarioId: string,
    private readonly tipo: string,
    private readonly referenciaId: string,
    private readonly titulo: string,
    private readonly codigoVerificacion: string,
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      certificadoId: this.aggregateId,
      usuarioId: this.usuarioId,
      tipo: this.tipo,
      referenciaId: this.referenciaId,
      titulo: this.titulo,
      codigoVerificacion: this.codigoVerificacion,
    }
  }
}
