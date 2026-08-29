import { Ok, type Query, type QueryHandler, type Result } from '@edtech/shared-kernel'
import type { FlashcardsError } from '../../domain/module.errors'
import type { MazoRepository } from '../../domain/ports-out/mazo.repository'

export type TarjetasDeTomoQuery = Query & {
  readonly _tag: 'TarjetasDeTomo'
  readonly tomoId: string
}

export type TarjetaPublica = { id: string; orden: number; anverso: string; reverso: string }

/** I-8: pide al repositorio las tarjetas del ESTUDIANTE. El filtro
 *  estado='PUBLICADA' está en el SQL del repositorio, no acá (doc 10 §6). */
export class TarjetasDeTomoHandler implements QueryHandler<
  TarjetasDeTomoQuery,
  TarjetaPublica[],
  FlashcardsError
> {
  readonly handles = 'TarjetasDeTomo' as const

  constructor(private readonly mazos: MazoRepository) {}

  async execute(q: TarjetasDeTomoQuery): Promise<Result<TarjetaPublica[], FlashcardsError>> {
    const tarjetas = await this.mazos.porTomoParaEstudiante(q.tomoId)
    return Ok(
      tarjetas.map(t => ({
        id: t.id,
        orden: t.orden,
        anverso: t.anverso,
        reverso: t.reverso,
      })),
    )
  }
}

export type MazosDeTomoAdminQuery = Query & {
  readonly _tag: 'MazosDeTomoAdmin'
  readonly tomoId: string
}

export type MazoAdminResponse = {
  mazoId: string
  version: number
  estado: string
  modeloUsado: string | null
  contenidoHash: string
  generadoAt: string | null
  tarjetas: {
    id: string
    orden: number
    anverso: string
    reverso: string
    estado: string
    editada: boolean
    motivoRechazo: string | null
  }[]
}

export class MazosDeTomoAdminHandler implements QueryHandler<
  MazosDeTomoAdminQuery,
  MazoAdminResponse[],
  FlashcardsError
> {
  readonly handles = 'MazosDeTomoAdmin' as const

  constructor(private readonly mazos: MazoRepository) {}

  async execute(q: MazosDeTomoAdminQuery): Promise<Result<MazoAdminResponse[], FlashcardsError>> {
    const mazos = await this.mazos.porTomoParaAdmin(q.tomoId)
    return Ok(
      mazos.map(m => ({
        mazoId: m.id.valor,
        version: m.version,
        estado: m.estado,
        modeloUsado: m.modeloUsado,
        contenidoHash: m.contenidoHash,
        generadoAt: m.generadoAt?.toISOString() ?? null,
        tarjetas: m.tarjetas.map(t => ({
          id: t.id,
          orden: t.orden,
          anverso: t.anverso,
          reverso: t.reverso,
          estado: t.estado,
          editada: t.editada,
          motivoRechazo: t.motivoRechazo,
        })),
      })),
    )
  }
}
