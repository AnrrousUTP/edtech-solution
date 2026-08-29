/** El contenido de las lecciones viaja por S3 (`bloquesS3Key` del evento):
 *  flashcards NO lee la base de catalog (doc 02 §7.3). */
export interface ContenidoFuente {
  leer(bloquesS3Key: string): Promise<string>
}

export interface ColaGeneracion {
  encolar(mazoId: string): Promise<void>
}
