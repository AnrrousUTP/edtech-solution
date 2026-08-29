import { Err, Ok, type Query, type QueryHandler, type Result } from '@edtech/shared-kernel'
import {
  BancoNoEncontradoError,
  LeccionNoEncontradaError,
  type CatalogError,
} from '../../domain/module.errors'
import type {
  CatalogoLectura,
  EvaluacionPublica,
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
