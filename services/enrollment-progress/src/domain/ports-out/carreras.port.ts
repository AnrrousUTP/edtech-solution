export type CarreraPublicada = {
  carreraId: string
  titulo: string
  cursoIds: string[]
}

/** A-24: lectura de las carreras publicadas (API pública de catalog) para
 *  detectar carrera-completada al completar un curso. Lectura poco frecuente,
 *  con timeout y degradación: si falla, no se emite el evento (se reintentará
 *  al completar el siguiente curso o por conciliación). */
export interface CarrerasPort {
  carrerasPublicadas(): Promise<CarreraPublicada[]>
}
