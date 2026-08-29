import { DomainEvent } from '@edtech/shared-kernel'

export type EstructuraTomo = {
  tomoId: string
  orden: number
  titulo: string
  umbral: number
  lecciones: { id: string; orden: number; titulo: string }[]
}

export class CursoPublicadoEvent extends DomainEvent {
  readonly eventType = 'catalog.curso-publicado.v1'

  constructor(
    readonly aggregateId: string,
    private readonly datos: {
      slug: string
      titulo: string
      tecnologia: string
      nivelMin: string
      nivelMax: string
      precio: number
      moneda: string
      versionPrecio: number
      estructura: EstructuraTomo[]
    },
  ) {
    super()
  }

  payload(): Record<string, unknown> {
    return { cursoId: this.aggregateId, ...this.datos }
  }
}
