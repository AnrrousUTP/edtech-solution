import type { TomoInfo } from '../domain/entities/curso.entity'
import type { LeccionPublicada } from '../domain/events/contenido-actualizado.event'
import type { Bloque } from '../domain/ports-out/curso.repository'
import type { ContenidoStore } from '../domain/ports-out/contenido-store.port'
import { hashContenido } from './hash-contenido'

export type ContextoGeneracionFlashcards = {
  cursoTitulo: string
  cursoTecnologia: string
  nivelMin: string
  nivelMax: string
}

/** Publica lecciones y resúmenes de materiales como fuentes del mazo semanal. */
export const publicarFuentesFlashcards = async (
  tomo: TomoInfo,
  contenidoStore: ContenidoStore,
  cargarBloques: (leccionId: string) => Promise<Bloque[]>,
  contexto: ContextoGeneracionFlashcards,
): Promise<{ lecciones: LeccionPublicada[]; contenidoHash: string }> => {
  const fuentes: LeccionPublicada[] = []
  const contextoCompleto = { ...contexto, tomoTitulo: tomo.titulo }

  for (const leccion of tomo.lecciones) {
    const bloques = await cargarBloques(leccion.id)
    const key = await contenidoStore.publicarContenidoLeccion(
      leccion.id,
      JSON.stringify({
        leccionId: leccion.id,
        titulo: leccion.titulo,
        contexto: contextoCompleto,
        bloques,
      }),
    )
    fuentes.push({ id: leccion.id, titulo: leccion.titulo, bloquesS3Key: key })
  }

  const materiales = (tomo.materiales ?? []).filter(material => material.textoExtraido?.trim())
  if (materiales.length > 0) {
    const texto = materiales
      .map(material => `## ${material.titulo}\n${material.textoExtraido?.trim()}`)
      .join('\n\n')
      .slice(0, 16000)
    const id = crypto.randomUUID()
    const key = await contenidoStore.publicarContenidoLeccion(
      id,
      JSON.stringify({
        tomoId: tomo.id,
        titulo: `Materiales: ${tomo.titulo}`,
        contexto: contextoCompleto,
        texto,
      }),
    )
    fuentes.push({ id, titulo: `Materiales: ${tomo.titulo}`, bloquesS3Key: key })
  }

  const contenidoHash = await hashContenido(
    JSON.stringify({
      contexto: contextoCompleto,
      lecciones: tomo.lecciones.map(leccion => leccion.contenidoHash),
      materiales: (tomo.materiales ?? []).map(material => ({
        titulo: material.titulo,
        textoExtraido: material.textoExtraido ?? '',
      })),
    }),
  )

  return { lecciones: fuentes, contenidoHash }
}
