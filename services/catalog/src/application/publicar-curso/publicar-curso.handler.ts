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
import { publicarFuentesFlashcards } from '../publicar-fuentes-flashcards'

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
        const fuentes = await publicarFuentesFlashcards(
          tomo,
          this.contenidoStore,
          leccionId => this.cursos.bloquesDe(UniqueId.desde(leccionId)),
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
    await this.publisher.publish(curso.pullEvents())
    return Ok({ estado: curso.estado, publicadoAt: curso.publicadoAt?.toISOString() ?? null })
  }
}
