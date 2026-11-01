import { Err, Ok, type Query, type QueryHandler, type Result } from '@edtech/shared-kernel'
import {
  BancoNoEncontradoError,
  LeccionNoEncontradaError,
  TomoNoEncontradoError,
  type CatalogError,
} from '../../domain/module.errors'
import type {
  BancoAdmin,
  CatalogoLectura,
  ContextoTomo,
  EvaluacionPublica,
  LeccionContenidoAdmin,
  LeccionContenido,
  RespuestasBanco,
} from '../../domain/ports-out/catalogo-lectura.port'

export type ObtenerLeccionQuery = Query & {
  readonly _tag: 'ObtenerLeccion'
  readonly leccionId: string
}

export class ObtenerLeccionHandler implements QueryHandler<
  ObtenerLeccionQuery,
  LeccionContenido,
  CatalogError
> {
  readonly handles = 'ObtenerLeccion' as const
  constructor(private readonly lectura: CatalogoLectura) {}

  async execute(q: ObtenerLeccionQuery): Promise<Result<LeccionContenido, CatalogError>> {
    const leccion = await this.lectura.leccionContenido(q.leccionId)
    if (!leccion) return Err(new LeccionNoEncontradaError(q.leccionId))
    return Ok(leccion)
  }
}

export type ObtenerLeccionAdminQuery = Query & {
  readonly _tag: 'ObtenerLeccionAdmin'
  readonly leccionId: string
}
export class ObtenerLeccionAdminHandler implements QueryHandler<
  ObtenerLeccionAdminQuery,
  LeccionContenidoAdmin,
  CatalogError
> {
  readonly handles = 'ObtenerLeccionAdmin' as const
  constructor(private readonly lectura: CatalogoLectura) {}
  async execute(q: ObtenerLeccionAdminQuery): Promise<Result<LeccionContenidoAdmin, CatalogError>> {
    const leccion = await this.lectura.leccionContenidoAdmin(q.leccionId)
    if (!leccion) return Err(new LeccionNoEncontradaError(q.leccionId))
    return Ok(leccion)
  }
}

export type ObtenerEvaluacionQuery = Query & {
  readonly _tag: 'ObtenerEvaluacion'
  readonly tomoId: string
}

/** Evaluación de tomo SIN respuestas correctas (I-5). */
export class ObtenerEvaluacionHandler implements QueryHandler<
  ObtenerEvaluacionQuery,
  EvaluacionPublica,
  CatalogError
> {
  readonly handles = 'ObtenerEvaluacion' as const
  constructor(private readonly lectura: CatalogoLectura) {}

  async execute(q: ObtenerEvaluacionQuery): Promise<Result<EvaluacionPublica, CatalogError>> {
    const evaluacion = await this.lectura.evaluacionDeTomo(q.tomoId)
    if (!evaluacion) return Err(new BancoNoEncontradoError(`evaluación del tomo ${q.tomoId}`))
    return Ok(evaluacion)
  }
}

export type ObtenerConocimientoPrevioQuery = Query & {
  readonly _tag: 'ObtenerConocimientoPrevio'
  readonly tomoId: string
}

export class ObtenerConocimientoPrevioHandler implements QueryHandler<
  ObtenerConocimientoPrevioQuery,
  EvaluacionPublica,
  CatalogError
> {
  readonly handles = 'ObtenerConocimientoPrevio' as const
  constructor(private readonly lectura: CatalogoLectura) {}

  async execute(q: ObtenerConocimientoPrevioQuery): Promise<Result<EvaluacionPublica, CatalogError>> {
    const evaluacion = await this.lectura.conocimientoPrevioDeTomo(q.tomoId)
    if (!evaluacion)
      return Err(new BancoNoEncontradoError(`conocimiento previo del tomo ${q.tomoId}`))
    return Ok(evaluacion)
  }
}

export type ObtenerRefuerzoQuery = Query & {
  readonly _tag: 'ObtenerRefuerzo'
  readonly tomoId: string
}
export class ObtenerRefuerzoHandler implements QueryHandler<
  ObtenerRefuerzoQuery,
  EvaluacionPublica,
  CatalogError
> {
  readonly handles = 'ObtenerRefuerzo' as const
  constructor(private readonly lectura: CatalogoLectura) {}
  async execute(q: ObtenerRefuerzoQuery): Promise<Result<EvaluacionPublica, CatalogError>> {
    const evaluacion = await this.lectura.refuerzoDeTomo(q.tomoId)
    if (!evaluacion) return Err(new BancoNoEncontradoError(`refuerzo del tomo ${q.tomoId}`))
    return Ok(evaluacion)
  }
}

export type ObtenerEvaluacionInicialQuery = Query & {
  readonly _tag: 'ObtenerEvaluacionInicial'
  readonly cursoId: string
}
export class ObtenerEvaluacionInicialHandler implements QueryHandler<
  ObtenerEvaluacionInicialQuery,
  EvaluacionPublica,
  CatalogError
> {
  readonly handles = 'ObtenerEvaluacionInicial' as const
  constructor(private readonly lectura: CatalogoLectura) {}
  async execute(
    q: ObtenerEvaluacionInicialQuery,
  ): Promise<Result<EvaluacionPublica, CatalogError>> {
    const evaluacion = await this.lectura.evaluacionInicialDeCurso(q.cursoId)
    if (!evaluacion)
      return Err(new BancoNoEncontradoError(`evaluación inicial del curso ${q.cursoId}`))
    return Ok(evaluacion)
  }
}

export type ObtenerNivelacionQuery = Query & { readonly _tag: 'ObtenerNivelacion' }

export class ObtenerNivelacionHandler implements QueryHandler<
  ObtenerNivelacionQuery,
  EvaluacionPublica,
  CatalogError
> {
  readonly handles = 'ObtenerNivelacion' as const
  constructor(private readonly lectura: CatalogoLectura) {}

  async execute(_q: ObtenerNivelacionQuery): Promise<Result<EvaluacionPublica, CatalogError>> {
    const banco = await this.lectura.nivelacion()
    if (!banco) return Err(new BancoNoEncontradoError('nivelación'))
    return Ok(banco)
  }
}

export type ObtenerDiagnosticoQuery = Query & { readonly _tag: 'ObtenerDiagnostico' }
export class ObtenerDiagnosticoHandler implements QueryHandler<
  ObtenerDiagnosticoQuery,
  EvaluacionPublica,
  CatalogError
> {
  readonly handles = 'ObtenerDiagnostico' as const
  constructor(private readonly lectura: CatalogoLectura) {}
  async execute(_q: ObtenerDiagnosticoQuery): Promise<Result<EvaluacionPublica, CatalogError>> {
    const evaluacion = await this.lectura.diagnosticoPrevio()
    if (!evaluacion) return Err(new BancoNoEncontradoError('diagnóstico previo'))
    return Ok(evaluacion)
  }
}

export type ObtenerContextoTomoQuery = Query & {
  readonly _tag: 'ObtenerContextoTomo'
  readonly tomoId: string
}
export class ObtenerContextoTomoHandler implements QueryHandler<
  ObtenerContextoTomoQuery,
  ContextoTomo,
  CatalogError
> {
  readonly handles = 'ObtenerContextoTomo' as const
  constructor(private readonly lectura: CatalogoLectura) {}
  async execute(q: ObtenerContextoTomoQuery): Promise<Result<ContextoTomo, CatalogError>> {
    const contexto = await this.lectura.contextoDeTomo(q.tomoId)
    if (!contexto) return Err(new TomoNoEncontradoError(q.tomoId))
    return Ok(contexto)
  }
}

export type ObtenerRespuestasQuery = Query & {
  readonly _tag: 'ObtenerRespuestas'
  readonly bancoId: string
}

/** SOLO API interna (A-19): enrollment corrige con esto. Nunca ruta pública. */
export class ObtenerRespuestasHandler implements QueryHandler<
  ObtenerRespuestasQuery,
  RespuestasBanco,
  CatalogError
> {
  readonly handles = 'ObtenerRespuestas' as const
  constructor(private readonly lectura: CatalogoLectura) {}

  async execute(q: ObtenerRespuestasQuery): Promise<Result<RespuestasBanco, CatalogError>> {
    const banco = await this.lectura.respuestasDeBanco(q.bancoId)
    if (!banco) return Err(new BancoNoEncontradoError(q.bancoId))
    return Ok(banco)
  }
}

export type ListarBancosAdminQuery = Query & { readonly _tag: 'ListarBancosAdmin' }
export class ListarBancosAdminHandler implements QueryHandler<
  ListarBancosAdminQuery,
  BancoAdmin[],
  CatalogError
> {
  readonly handles = 'ListarBancosAdmin' as const
  constructor(private readonly lectura: CatalogoLectura) {}
  async execute(_q: ListarBancosAdminQuery): Promise<Result<BancoAdmin[], CatalogError>> {
    return Ok(await this.lectura.listarBancosAdmin())
  }
}
