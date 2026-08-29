import type { UniqueId } from '@edtech/shared-kernel'
import type { Curso } from '../entities/curso.entity'

export type Bloque = { orden: number; tipo: string; contenido: Record<string, unknown> }
export type Ejercicio = {
  id?: string
  enunciado: string
  solucionEsperada: Record<string, unknown> // NUNCA sale por la API pública (I-5)
  pistas: unknown[]
}

export interface CursoRepository {
  porId(id: UniqueId): Promise<Curso | null>
  porSlug(slug: string): Promise<Curso | null>
  guardar(curso: Curso): Promise<void>
  /** Contenido de bloques: se maneja aparte del agregado (pesa; el agregado guarda el hash). */
  reemplazarBloques(leccionId: UniqueId, bloques: Bloque[]): Promise<void>
  bloquesDe(leccionId: UniqueId): Promise<Bloque[]>
  reemplazarEjercicios(leccionId: UniqueId, ejercicios: Ejercicio[]): Promise<void>
  ejerciciosDe(leccionId: UniqueId): Promise<Ejercicio[]>
}
