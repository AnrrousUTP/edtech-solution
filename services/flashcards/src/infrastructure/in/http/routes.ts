import {
  isOk,
  requiereAuth,
  requiereRol,
  type CommandBus,
  type QueryBus,
  type Result,
} from '@edtech/shared-kernel'
import { Router, json, type Request, type Response } from 'express'
import type { Config } from '../../config/config'

const MAPA: Record<string, number> = {
  MAZO_NO_ENCONTRADO: 404,
  TARJETA_NO_ENCONTRADA: 404,
  MAZO_NO_REVISABLE: 409,
  MOTIVO_REQUERIDO: 400,
  GENERACION_FALLIDA: 502,
  SALIDA_INVALIDA: 502,
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
  const admin = [auth, requiereRol('admin')]

  /** Estudiante: SOLO tarjetas PUBLICADA — el filtro está en el repositorio (I-8). */
  router.get('/tomos/:tomoId', auth, async (req, res) => {
    responder(
      res,
      await queries.dispatch({ _tag: 'TarjetasDeTomo', tomoId: req.params.tomoId ?? '' }),
    )
  })

  /** Panel de revisión (admin): todos los mazos y estados del tomo. */
  router.get('/admin/tomos/:tomoId', ...admin, async (req, res) => {
    responder(
      res,
      await queries.dispatch({ _tag: 'MazosDeTomoAdmin', tomoId: req.params.tomoId ?? '' }),
    )
  })

  router.post('/admin/mazos/:mazoId/tarjetas/:tarjetaId/aprobar', ...admin, async (req, res) => {
    const b = cuerpo(req)
    const edicion =
      typeof b.anverso === 'string' && typeof b.reverso === 'string'
        ? { edicion: { anverso: b.anverso, reverso: b.reverso } }
        : {}
    responder(
      res,
      await bus.dispatch({
        _tag: 'AprobarTarjeta',
        mazoId: req.params.mazoId ?? '',
        tarjetaId: req.params.tarjetaId ?? '',
        revisorId: req.auth?.usuarioId ?? '',
        ...edicion,
      }),
    )
  })

  router.post('/admin/mazos/:mazoId/tarjetas/:tarjetaId/rechazar', ...admin, async (req, res) => {
    const b = cuerpo(req)
    responder(
      res,
      await bus.dispatch({
        _tag: 'RechazarTarjeta',
        mazoId: req.params.mazoId ?? '',
        tarjetaId: req.params.tarjetaId ?? '',
        revisorId: req.auth?.usuarioId ?? '',
        motivo: String(b.motivo ?? ''),
      }),
    )
  })

  return router
}
