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
import type { CambiosPerfil } from '../../../domain/entities/usuario.entity'
import type { PerfilResponse } from '../../../application/obtener-perfil/obtener-perfil.handler'

// Mapa explícito código de dominio → HTTP (doc 04 §8). Sin instanceof.
const MAPA: Record<string, number> = {
  USUARIO_NO_ENCONTRADO: 404,
  PERFIL_INVALIDO: 400,
  NIVEL_INVALIDO: 400,
  EMAIL_INVALIDO: 400,
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
  })

  router.get('/me', auth, async (req, res) => {
    const usuarioId = req.auth?.usuarioId ?? ''
    const r = await queries.dispatch<PerfilResponse, { code: string; message: string }>({
      _tag: 'ObtenerPerfil',
      usuarioId,
      // Alta perezosa (doc 08 §4.3): el access token no trae email; se usa un
      // placeholder que la reconciliación con Cognito corrige después.
      altaPerezosa: {
        email: req.auth?.email ?? `${usuarioId}@pendiente.edtech`,
        ...(req.auth?.nombreVisible ? { nombreVisible: req.auth.nombreVisible } : {}),
      },
    })
    responder(res, r)
  })

  router.put('/me', auth, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const cambios: CambiosPerfil = {}
    if (typeof body.nombreVisible === 'string') cambios.nombreVisible = body.nombreVisible
    if (typeof body.avatarUrl === 'string' || body.avatarUrl === null)
      cambios.avatarUrl = body.avatarUrl as string | null
    if (typeof body.pais === 'string' || body.pais === null)
      cambios.pais = body.pais as string | null
    if (typeof body.idioma === 'string') cambios.idioma = body.idioma
    const r = await bus.dispatch<{ actualizado: boolean }, { code: string; message: string }>({
      _tag: 'ActualizarPerfil',
      usuarioId: req.auth?.usuarioId ?? '',
      cambios,
    })
    responder(res, r)
  })

  router.get('/usuarios/:id', auth, requiereRol('admin'), async (req, res) => {
    const r = await queries.dispatch<PerfilResponse, { code: string; message: string }>({
      _tag: 'ObtenerPerfil',
      usuarioId: req.params.id ?? '',
    })
    responder(res, r)
  })

  return router
}
