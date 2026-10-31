import {
  Err,
  Ok,
  UniqueId,
  isErr,
  type Command,
  type CommandHandler,
  type IEventPublisher,
  type Result,
} from '@edtech/shared-kernel'
import type { LeccionInfo, MaterialInfo, TomoInfo } from '../../domain/entities/curso.entity'
import {
  ContenidoInvalidoError,
  CursoNoEncontradoError,
  type CatalogError,
} from '../../domain/module.errors'
import type { Bloque, CursoRepository, Ejercicio } from '../../domain/ports-out/curso.repository'
import type { ContenidoStore } from '../../domain/ports-out/contenido-store.port'
import { hashContenido } from '../hash-contenido'
import { publicarFuentesFlashcards } from '../publicar-fuentes-flashcards'

export type LeccionEntrada = {
  id?: string
  orden: number
  titulo: string
  duracionMin: number
  bloques: Bloque[]
  ejercicios?: Ejercicio[]
}

export type TomoEntrada = {
  id?: string
  orden: number
  titulo: string
  descripcion?: string
  umbral?: number
  materiales?: Omit<MaterialInfo, 'id'>[]
  lecciones: LeccionEntrada[]
}

export type ActualizarContenidoCommand = Command & {
  readonly _tag: 'ActualizarContenido'
  readonly cursoId: string
  readonly tomos: TomoEntrada[]
  readonly generarFlashcards?: boolean
}

export type ActualizarContenidoResponse = {
  tomos: { id: string; lecciones: string[] }[]
  lecciones: number
}

/** Reemplaza la estructura completa de tomos/lecciones/bloques del curso.
 *  Calcula contenido_hash por lección (caché de flashcards, doc 03 §5). El curso
 *  publicado genera al actualizarse; el docente puede solicitarlo para un
 *  borrador con generarFlashcards. */
export class ActualizarContenidoHandler implements CommandHandler<
  ActualizarContenidoCommand,
  ActualizarContenidoResponse,
  CatalogError
> {
  readonly handles = 'ActualizarContenido' as const

  constructor(
    private readonly cursos: CursoRepository,
    private readonly contenidoStore: ContenidoStore,
    private readonly publisher: IEventPublisher,
  ) {}

  async execute(
    cmd: ActualizarContenidoCommand,
  ): Promise<Result<ActualizarContenidoResponse, CatalogError>> {
    const curso = await this.cursos.porId(UniqueId.desde(cmd.cursoId))
    if (!curso) return Err(new CursoNoEncontradoError(cmd.cursoId))

    // Construir la estructura con ids y hashes
    const tomos: TomoInfo[] = []
    const bloquesPorLeccion = new Map<string, Bloque[]>()
    const ejerciciosPorLeccion = new Map<string, Ejercicio[]>()

    for (const tomo of cmd.tomos) {
      const umbral = tomo.umbral ?? 70
      if (umbral < 1 || umbral > 100)
        return Err(new ContenidoInvalidoError(`Umbral fuera de rango: ${umbral}`))
      const lecciones: LeccionInfo[] = []
      for (const leccion of tomo.lecciones) {
        const id = leccion.id ?? UniqueId.nuevo().valor
        const hash = await hashContenido(JSON.stringify(leccion.bloques))
        lecciones.push({
          id,
          orden: leccion.orden,
          titulo: leccion.titulo,
          duracionMin: leccion.duracionMin,
          contenidoHash: hash,
        })
        bloquesPorLeccion.set(id, leccion.bloques)
        if (leccion.ejercicios) ejerciciosPorLeccion.set(id, leccion.ejercicios)
      }
      tomos.push({
        id: tomo.id ?? UniqueId.nuevo().valor,
        orden: tomo.orden,
        titulo: tomo.titulo,
        descripcion: tomo.descripcion ?? null,
        umbral,
        materiales: (tomo.materiales ?? []).map((material, index) => ({
          ...material,
          id: UniqueId.nuevo().valor,
          orden: material.orden ?? index + 1,
        })),
        lecciones,
      })
    }

    const r = curso.reemplazarTomos(tomos)
    if (isErr(r)) return Err(r.error)

    // Los cursos publicados se regeneran al cambiar; en borradores solo se
    // ejecuta cuando el docente lo pide expresamente desde el editor.
    if (curso.estado === 'PUBLICADO' || cmd.generarFlashcards === true) {
      for (const tomo of tomos) {
        const fuentes = await publicarFuentesFlashcards(
          tomo,
          this.contenidoStore,
          async leccionId => bloquesPorLeccion.get(leccionId) ?? [],
          {
            cursoTitulo: curso.titulo,
            cursoTecnologia: curso.tecnologia,
            nivelMin: curso.nivelMin.valor,
            nivelMax: curso.nivelMax.valor,
          },
        )
        const rEvento = curso.registrarContenidoActualizado(
          tomo.id,
          fuentes.contenidoHash,
          fuentes.lecciones,
        )
        if (isErr(rEvento)) return Err(rEvento.error)
      }
    }

    await this.cursos.guardar(curso)
    for (const [leccionId, bloques] of bloquesPorLeccion) {
      await this.cursos.reemplazarBloques(UniqueId.desde(leccionId), bloques)
    }
    for (const [leccionId, ejercicios] of ejerciciosPorLeccion) {
      await this.cursos.reemplazarEjercicios(UniqueId.desde(leccionId), ejercicios)
    }
    await this.publisher.publish(curso.pullEvents())

    return Ok({
      tomos: tomos.map(t => ({ id: t.id, lecciones: t.lecciones.map(l => l.id) })),
      lecciones: tomos.reduce((total, tomo) => total + tomo.lecciones.length, 0),
    })
  }
}
