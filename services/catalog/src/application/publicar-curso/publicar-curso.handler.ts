import {
  Err,
  Ok,
  UniqueId,
  isErr,
  type Command,
  type CommandHandler,
  type IEventPublisher,
  type Reloj,
  type Result,
} from '@edtech/shared-kernel'
import { CursoNoEncontradoError, type CatalogError } from '../../domain/module.errors'
import type { CursoRepository } from '../../domain/ports-out/curso.repository'
import type { ContenidoStore } from '../../domain/ports-out/contenido-store.port'
import { hashContenido } from '../hash-contenido'

export type PublicarCursoCommand = Command & {
  readonly _tag: 'PublicarCurso'
  readonly cursoId: string
}

export type PublicarCursoResponse = { estado: string; publicadoAt: string | null }

/** Publica el curso (invariantes en la entidad) y emite además
 *  contenido-actualizado por cada tomo, para que flashcards genere los mazos
 *  del contenido recién publicado (regla flashcards-desde-catalog). */
export class PublicarCursoHandler implements CommandHandler<
  PublicarCursoCommand,
  PublicarCursoResponse,
  CatalogError
> {
  readonly handles = 'PublicarCurso' as const

  constructor(
    private readonly cursos: CursoRepository,
    private readonly contenidoStore: ContenidoStore,
    private readonly publisher: IEventPublisher,
    private readonly reloj: Reloj,
  ) {}

  async execute(cmd: PublicarCursoCommand): Promise<Result<PublicarCursoResponse, CatalogError>> {
    const curso = await this.cursos.porId(UniqueId.desde(cmd.cursoId))
    if (!curso) return Err(new CursoNoEncontradoError(cmd.cursoId))

    const yaPublicado = curso.estado === 'PUBLICADO'
    const r = curso.publicar(this.reloj.ahora())
    if (isErr(r)) return Err(r.error)

    if (!yaPublicado) {
      for (const tomo of curso.tomos) {
        const publicadas = []
        for (const leccion of tomo.lecciones) {
          const bloques = await this.cursos.bloquesDe(UniqueId.desde(leccion.id))
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
    await this.publisher.publish(curso.pullEvents())
    return Ok({ estado: curso.estado, publicadoAt: curso.publicadoAt?.toISOString() ?? null })
  }
}
