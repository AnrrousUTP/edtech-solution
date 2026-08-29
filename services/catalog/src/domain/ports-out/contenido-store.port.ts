/** Publica el contenido de una lección (sus bloques serializados) para que
 *  flashcards lo lea sin tocar la base de catalog (doc 02 §7.3). */
export interface ContenidoStore {
  /** Devuelve la clave con la que quedó almacenado (bloquesS3Key del evento). */
  publicarContenidoLeccion(leccionId: string, contenido: string): Promise<string>
}
