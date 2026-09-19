import { Ok, type Query, type QueryHandler, type Result } from '@edtech/shared-kernel'
import type { GamificationError } from '../../domain/module.errors'
import type { PerfilRepository } from '../../domain/ports-out/perfil.repository'

export type ListarPerfilesAdminQuery = Query & { readonly _tag: 'ListarPerfilesAdmin' }

export type PerfilAdminResponse = {
  usuarioId: string
  nombreTitular: string | null
  puntos: number
  rachaActual: number
  rachaMaxima: number
  ultimaActividad: string | null
  insignias: { criterio: string; referenciaId: string; otorgadaAt: string }[]
}

export class ListarPerfilesAdminHandler implements QueryHandler<
  ListarPerfilesAdminQuery,
  PerfilAdminResponse[],
  GamificationError
> {
  readonly handles = 'ListarPerfilesAdmin' as const

  constructor(private readonly perfiles: PerfilRepository) {}

  async execute(
    _query: ListarPerfilesAdminQuery,
  ): Promise<Result<PerfilAdminResponse[], GamificationError>> {
    const perfiles = await this.perfiles.todos()
    return Ok(
      perfiles.map(perfil => ({
        usuarioId: perfil.usuarioId.valor,
        nombreTitular: perfil.nombreTitular,
        puntos: perfil.puntos,
        rachaActual: perfil.rachaActual,
        rachaMaxima: perfil.rachaMaxima,
        ultimaActividad: perfil.ultimaActividad?.toISOString() ?? null,
        insignias: perfil.insignias.map(insignia => ({
          criterio: insignia.criterio,
          referenciaId: insignia.referenciaId,
          otorgadaAt: insignia.otorgadaAt.toISOString(),
        })),
      })),
    )
  }
}
