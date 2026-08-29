import { Ok, log, type Command, type CommandHandler, type Result } from '@edtech/shared-kernel'
import { MazoFlashcards } from '../../domain/entities/mazo-flashcards.entity'
import type { FlashcardsError } from '../../domain/module.errors'
import type { ColaGeneracion } from '../../domain/ports-out/contenido-fuente.port'
import type { MazoRepository } from '../../domain/ports-out/mazo.repository'

export type SolicitarGeneracionCommand = Command & {
  readonly _tag: 'SolicitarGeneracion'
  readonly cursoId: string
  readonly tomoId: string
  readonly contenidoHash: string
  readonly lecciones: { id: string; titulo: string; bloquesS3Key: string }[]
}

export type SolicitarGeneracionResponse = { mazoId: string | null; desdeCache: boolean }

/** Caché por hash (doc 10 §5): si ya existe un mazo con ese (tomo, hash), NO se
 *  invoca al modelo. Corregir una tilde no cuesta 60 s ni dinero. */
export class SolicitarGeneracionHandler implements CommandHandler<
  SolicitarGeneracionCommand,
  SolicitarGeneracionResponse,
  FlashcardsError
> {
  readonly handles = 'SolicitarGeneracion' as const

  constructor(
    private readonly mazos: MazoRepository,
    private readonly cola: ColaGeneracion,
  ) {}

  async execute(
    cmd: SolicitarGeneracionCommand,
  ): Promise<Result<SolicitarGeneracionResponse, FlashcardsError>> {
    const existente = await this.mazos.porTomoYHash(cmd.tomoId, cmd.contenidoHash)
    if (existente) {
      log.info('mazo ya existe para este hash: no se invoca al modelo', {
        tomoId: cmd.tomoId,
        mazoId: existente.id.valor,
      })
      return Ok({ mazoId: existente.id.valor, desdeCache: true })
    }

    // Hash nuevo → versión N+1 en revisión; el mazo N sigue publicado (doc 10 §5)
    const version = (await this.mazos.ultimaVersionDe(cmd.tomoId)) + 1
    const mazo = MazoFlashcards.crear({
      tomoId: cmd.tomoId,
      cursoId: cmd.cursoId,
      contenidoHash: cmd.contenidoHash,
      version,
      leccionesFuente: cmd.lecciones,
    })
    await this.mazos.guardar(mazo)
    await this.cola.encolar(mazo.id.valor)

    return Ok({ mazoId: mazo.id.valor, desdeCache: false })
  }
}
