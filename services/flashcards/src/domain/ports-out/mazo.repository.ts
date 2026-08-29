import type { UniqueId } from '@edtech/shared-kernel'
import type { MazoFlashcards, Tarjeta } from '../entities/mazo-flashcards.entity'

export interface MazoRepository {
  porId(id: UniqueId): Promise<MazoFlashcards | null>
  /** Caché por hash (doc 10 §5): si existe, NO se invoca al modelo. */
  porTomoYHash(tomoId: string, contenidoHash: string): Promise<MazoFlashcards | null>
  ultimaVersionDe(tomoId: string): Promise<number>
  /** Mazos de un tomo para el panel de admin (todos los estados). */
  porTomoParaAdmin(tomoId: string): Promise<MazoFlashcards[]>
  /** I-8: el filtro estado='PUBLICADA' vive ACÁ, no en el controlador. Un
   *  endpoint nuevo no tiene forma de pedir tarjetas sin revisar. */
  porTomoParaEstudiante(tomoId: string): Promise<Tarjeta[]>
  guardar(mazo: MazoFlashcards): Promise<void>
}
