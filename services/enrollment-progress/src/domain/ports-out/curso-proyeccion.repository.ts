import type { CursoProyectado } from '../value-objects/curso-proyectado.vo'

export type ProyeccionEntrada = {
  cursoId: string
  titulo: string
  slug: string
  publicado: boolean
  precio: number
  nivelMax: string | null
  estructura: unknown // el árbol tomo→lección tal como llega en el evento
}

export type FuenteEventoProyeccion = {
  eventId: string
  eventType: string
  occurredAt: string
}

export interface CursoProyeccionRepository {
  porId(cursoId: string): Promise<CursoProyectado | null>
  guardar(entrada: ProyeccionEntrada, fuente?: FuenteEventoProyeccion): Promise<void>
  marcarPublicado(
    cursoId: string,
    publicado: boolean,
    fuente?: FuenteEventoProyeccion,
  ): Promise<void>
  /** Refresca las lecciones de un tomo (evento contenido-actualizado). */
  actualizarTomo(
    cursoId: string,
    tomoId: string,
    lecciones: { id: string; titulo: string }[],
    fuente?: FuenteEventoProyeccion,
  ): Promise<void>
}
