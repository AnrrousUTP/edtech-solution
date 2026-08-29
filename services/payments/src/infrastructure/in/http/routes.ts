import {
  isOk,
  requiereAuth,
  type CommandBus,
  type QueryBus,
  type Result,
} from '@edtech/shared-kernel'
import { Router, json, type Request, type Response } from 'express'
import type { Config } from '../../config/config'

const MAPA: Record<string, number> = {
  ORDEN_NO_ENCONTRADA: 404,
  ORDEN_EXPIRADA: 409,
  ORDEN_NO_CAPTURABLE: 409,
  ORDEN_AJENA: 403,
  CURSO_NO_DISPONIBLE: 404,
  CURSO_GRATUITO: 409,
  YA_COMPRADO: 409,
  DINERO_INVALIDO: 400,
  PASARELA_ERROR: 502,
  FIRMA_INVALIDA: 401,
  ID_INVALIDO: 400,
}
const codigoHttp = (code: string): number => MAPA[code] ?? 500

const responder = <T>(
  res: Response,
  r: Result<T, { code: string; message: string }>,
  okStatus = 200,
): void => {
  if (isOk(r)) {
    res.status(okStatus).json({ data: r.value })
    return
  }
  res.status(codigoHttp(r.error.code)).json({
    error: { code: r.error.code, message: r.error.message },
  })
}

const cuerpo = (req: Request): Record<string, unknown> =>
  (req.body ?? {}) as Record<string, unknown>

export const crearRouter = (bus: CommandBus, queries: QueryBus, cfg: Config): Router => {
  const router = Router()
  router.use(json())
  const auth = requiereAuth({
    issuer: cfg.cognito.issuer,
    ...(cfg.cognito.clientId ? { clientId: cfg.cognito.clientId } : {}),
    ...(cfg.cognito.jwksUri ? { jwksUri: cfg.cognito.jwksUri } : {}),
  })

  router.post('/ordenes', auth, async (req, res) => {
    const b = cuerpo(req)
    responder(
      res,
      await bus.dispatch({
        _tag: 'CrearOrden',
        usuarioId: req.auth?.usuarioId ?? '',
        cursoId: String(b.cursoId ?? ''),
        urlRetorno: String(b.urlRetorno ?? `${cfg.urlBase}/pago/retorno`),
        urlCancelacion: String(b.urlCancelacion ?? `${cfg.urlBase}/pago/cancelado`),
      }),
      201,
    )
  })

  router.post('/ordenes/:id/capturar', auth, async (req, res) => {
    responder(
      res,
      await bus.dispatch({
        _tag: 'CapturarPago',
        ordenId: req.params.id ?? '',
        usuarioId: req.auth?.usuarioId ?? '',
      }),
    )
  })

  /** Polling honesto del frontend tras capturar (doc 09 §2, paso 12). */
  router.get('/ordenes/:id', auth, async (req, res) => {
    responder(
      res,
      await queries.dispatch({
        _tag: 'EstadoOrden',
        ordenId: req.params.id ?? '',
        usuarioId: req.auth?.usuarioId ?? '',
      }),
    )
  })

  router.get('/mis-ordenes', auth, async (req, res) => {
    responder(
      res,
      await queries.dispatch({ _tag: 'MisOrdenes', usuarioId: req.auth?.usuarioId ?? '' }),
    )
  })

  return router
}
