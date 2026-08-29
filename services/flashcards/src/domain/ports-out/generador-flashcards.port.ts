import type { Result } from '@edtech/shared-kernel'
import type { GeneracionError } from '../module.errors'

export type EntradaGeneracion = {
  tomoTitulo: string
  cursoTecnologia: string
  nivel: string
  lecciones: { titulo: string; contenido: string }[]
  cantidadDeseada: number
}

export type SalidaGeneracion = {
  tarjetas: { anverso: string; reverso: string }[]
  modeloUsado: string
}

/** El dominio NO sabe que existe AWS, Bedrock, SQS ni una Lambda (doc 10 §4).
 *  Cambiar de Agent a InvokeModel —o a otro proveedor— es una clase. */
export interface GeneradorFlashcardsPort {
  generar(input: EntradaGeneracion): Promise<Result<SalidaGeneracion, GeneracionError>>
}
