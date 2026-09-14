import {
  isOk,
  requiereAuth,
  requiereRol,
  type CommandBus,
  type QueryBus,
  type Result,
} from '@edtech/shared-kernel'
import { Router, json, type Response } from 'express'
import type { Config } from '../../config/config'

const MAPA: Record<string, number> = {
  PERFIL_NO_ENCONTRADO: 404,
  CERTIFICADO_NO_ENCONTRADO: 404,
  CODIGO_INVALIDO: 400,
  CRITERIO_INVALIDO: 400,
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

export const crearRouter = (bus: CommandBus, queries: QueryBus, cfg: Config): Router => {
  const router = Router()
  router.use(json())
  const auth = requiereAuth({
    issuer: cfg.cognito.issuer,
    ...(cfg.cognito.clientId ? { clientId: cfg.cognito.clientId } : {}),
    ...(cfg.cognito.jwksUri ? { jwksUri: cfg.cognito.jwksUri } : {}),
  })
  const admin = [auth, requiereRol('admin')]

  router.get('/mi-perfil', auth, async (req, res) => {
    responder(
      res,
      await queries.dispatch({ _tag: 'MiPerfil', usuarioId: req.auth?.usuarioId ?? '' }),
    )
  })

  // PÚBLICA sin cuenta: verificación de certificado (pantalla 11 del doc 11)
  router.get('/certificados/:codigo', async (req, res) => {
    responder(
      res,
      await queries.dispatch({ _tag: 'VerificarCertificado', codigo: req.params.codigo ?? '' }),
    )
  })

  router.post('/admin/certificados/curso', ...admin, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    responder(
      res,
      await bus.dispatch({
        _tag: 'OtorgarPorCurso',
        usuarioId: String(b.usuarioId ?? ''),
        cursoId: String(b.cursoId ?? ''),
        cursoTitulo: String(b.cursoTitulo ?? ''),
      }),
    )
  })

  router.post('/admin/certificados/carrera', ...admin, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    responder(
      res,
      await bus.dispatch({
        _tag: 'OtorgarPorCarrera',
        usuarioId: String(b.usuarioId ?? ''),
        carreraId: String(b.carreraId ?? ''),
        carreraTitulo: String(b.carreraTitulo ?? ''),
      }),
    )
  })

  return router
}
