import { DomainEvent } from '@edtech/shared-kernel'

export type LeccionPublicada = { id: string; titulo: string; bloquesS3Key: string }

export class ContenidoActualizadoEvent extends DomainEvent {
  readonly eventType = 'catalog.contenido-actualizado.v1'

  constructor(
    readonly aggregateId: string, // cursoId
    private readonly tomoId: string,
    private readonly contenidoHash: string,
    private readonly lecciones: LeccionPublicada[],
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return {
      cursoId: this.aggregateId,
      tomoId: this.tomoId,
      contenidoHash: this.contenidoHash,
      lecciones: this.lecciones,
    }
  }
}
