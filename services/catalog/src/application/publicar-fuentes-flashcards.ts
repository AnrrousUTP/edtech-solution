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

  const materiales = (tomo.materiales ?? [])
    .filter(
      material =>
        !material.enfoques?.length ||
        material.enfoques.some(enfoque => enfoque === 'CONTENIDO_SEMANAL' || enfoque === 'REPASO'),
    )
    .map(material => ({
      titulo: material.titulo,
      texto: material.textoExtraido?.trim() || material.descripcion?.trim() || '',
    }))
    .filter(material => material.texto.length > 0)
  if (materiales.length > 0) {
    const objetivos = (tomo.objetivos ?? []).filter(Boolean)
    const texto = [
      ...(objetivos.length ? [`Objetivos de aprendizaje:\n${objetivos.join('\n')}`] : []),
      ...materiales.map(material => `## ${material.titulo}\n${material.texto}`),
    ].join('\n\n').slice(0, 16000)
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
      objetivos: tomo.objetivos ?? [],
      materiales: materiales.map(material => ({ titulo: material.titulo, texto: material.texto })),
    }),
  )

  return { lecciones: fuentes, contenidoHash }
}
