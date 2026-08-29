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
import type { LeccionInfo, TomoInfo } from '../../domain/entities/curso.entity'
import {
  ContenidoInvalidoError,
  CursoNoEncontradoError,
  type CatalogError,
} from '../../domain/module.errors'
import type { Bloque, CursoRepository, Ejercicio } from '../../domain/ports-out/curso.repository'
import type { ContenidoStore } from '../../domain/ports-out/contenido-store.port'
import { hashContenido } from '../hash-contenido'

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
  lecciones: LeccionEntrada[]
}

export type ActualizarContenidoCommand = Command & {
  readonly _tag: 'ActualizarContenido'
  readonly cursoId: string
  readonly tomos: TomoEntrada[]
}

export type ActualizarContenidoResponse = {
  tomos: { id: string; lecciones: string[] }[]
}

/** Reemplaza la estructura completa de tomos/lecciones/bloques del curso.
 *  Calcula contenido_hash por lección (caché de flashcards, doc 03 §5) y, si el
 *  curso está publicado, sube el contenido al store y registra
 *  contenido-actualizado por tomo. */
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
        lecciones,
      })
    }

    const r = curso.reemplazarTomos(tomos)
    if (isErr(r)) return Err(r.error)

    // Si está publicado, el contenido nuevo dispara los eventos por tomo
    if (curso.estado === 'PUBLICADO') {
      for (const tomo of tomos) {
        const publicadas = []
        for (const leccion of tomo.lecciones) {
          const bloques = bloquesPorLeccion.get(leccion.id) ?? []
          const key = await this.contenidoStore.publicarContenidoLeccion(
            leccion.id,
            JSON.stringify({ leccionId: leccion.id, titulo: leccion.titulo, bloques }),
          )
          publicadas.push({ id: leccion.id, titulo: leccion.titulo, bloquesS3Key: key })
        }
        const hashTomo = await hashContenido(tomo.lecciones.map(l => l.contenidoHash).join('|'))
        const rEvento = curso.registrarContenidoActualizado(tomo.id, hashTomo, publicadas)
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

    return Ok({ tomos: tomos.map(t => ({ id: t.id, lecciones: t.lecciones.map(l => l.id) })) })
  }
}
