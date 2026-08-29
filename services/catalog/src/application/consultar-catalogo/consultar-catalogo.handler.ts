import { Err, Ok, type Query, type QueryHandler, type Result } from '@edtech/shared-kernel'
import { CursoNoEncontradoError, type CatalogError } from '../../domain/module.errors'
import type {
  CarreraResumen,
  CatalogoLectura,
  CursoDetalle,
  CursoResumen,
} from '../../domain/ports-out/catalogo-lectura.port'

export type ListarCursosQuery = Query & {
  readonly _tag: 'ListarCursos'
  readonly incluirNoPublicados: boolean
}

export class ListarCursosHandler implements QueryHandler<
  ListarCursosQuery,
  CursoResumen[],
  CatalogError
> {
  readonly handles = 'ListarCursos' as const
  constructor(private readonly lectura: CatalogoLectura) {}

  async execute(q: ListarCursosQuery): Promise<Result<CursoResumen[], CatalogError>> {
    return Ok(await this.lectura.listarCursos(q.incluirNoPublicados))
  }
}

export type ObtenerCursoQuery = Query & {
  readonly _tag: 'ObtenerCurso'
  readonly slugOId: string
  readonly incluirNoPublicados: boolean
}

export class ObtenerCursoHandler implements QueryHandler<
  ObtenerCursoQuery,
  CursoDetalle,
  CatalogError
> {
  readonly handles = 'ObtenerCurso' as const
  constructor(private readonly lectura: CatalogoLectura) {}

  async execute(q: ObtenerCursoQuery): Promise<Result<CursoDetalle, CatalogError>> {
    const esUuid = /^[0-9a-f-]{36}$/i.test(q.slugOId)
    const curso = esUuid
      ? await this.lectura.cursoPorId(q.slugOId, q.incluirNoPublicados)
      : await this.lectura.cursoPorSlug(q.slugOId, q.incluirNoPublicados)
    if (!curso) return Err(new CursoNoEncontradoError(q.slugOId))
    return Ok(curso)
  }
}

export type ListarCarrerasQuery = Query & {
  readonly _tag: 'ListarCarreras'
  readonly incluirNoPublicadas: boolean
}

export class ListarCarrerasHandler implements QueryHandler<
  ListarCarrerasQuery,
  CarreraResumen[],
  CatalogError
> {
  readonly handles = 'ListarCarreras' as const
  constructor(private readonly lectura: CatalogoLectura) {}

  async execute(q: ListarCarrerasQuery): Promise<Result<CarreraResumen[], CatalogError>> {
    return Ok(await this.lectura.listarCarreras(q.incluirNoPublicadas))
  }
}
