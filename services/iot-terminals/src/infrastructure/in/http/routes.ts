import { requiereAuth, requiereRol } from '@edtech/shared-kernel'
import { Router, json, type Request, type Response, type NextFunction } from 'express'
import type { TerminalHandler } from '../../../application/terminal/terminal.handler'
import { TerminalError } from '../../../domain/module.errors'
import type { Config } from '../../config/config'
export const crearRouter = (
  handler: TerminalHandler,
  cfg: Config,
  onAsignacionCambiada: () => Promise<void> = async () => undefined,
): Router => {
  const r = Router()
  r.use(json({ limit: '8kb' }))
  const auth = requiereAuth({ issuer: cfg.issuer, clientId: cfg.clientId, jwksUri: cfg.jwksUri })
  const wrap =
    (f: (req: Request) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction): void => {
      void f(req)
        .then(data => res.json({ data }))
        .catch(next)
    }
  const repo = handler.repositorio
  r.get(
    '/me',
    auth,
    wrap(req => repo.mio(req.auth!.usuarioId)),
  )
  r.post(
    '/solicitud',
    auth,
    wrap(async req => {
      await repo.solicitar(req.auth!.usuarioId)
      return { solicitada: true }
    }),
  )
  r.put(
    '/me',
    auth,
    wrap(req => {
      if (typeof req.body?.habilitado !== 'boolean' || !Number.isSafeInteger(req.body?.version))
        throw new TerminalError('DATOS_INVALIDOS', 'Indica el estado y la versión de configuración')
      return handler.configurar(
        req.auth!.usuarioId,
        req.body.mensaje,
        req.body.habilitado,
        req.body.version,
      )
    }),
  )
  r.get(
    '/vista/:id',
    wrap(req => repo.vista(String(req.params.id), String(req.query.token ?? ''))),
  )
  r.get(
    '/admin',
    auth,
    requiereRol('admin'),
    wrap(() => repo.admin()),
  )
  r.put(
    '/admin/asignacion',
    auth,
    requiereRol('admin'),
    wrap(async req => {
      const user = req.body?.usuarioId
      if (user !== null && (typeof user !== 'string' || !/^[0-9a-f-]{36}$/i.test(user)))
        throw new TerminalError('DATOS_INVALIDOS', 'Selecciona un afiliado')
      await repo.asignar(user)
      await onAsignacionCambiada()
      return { asignado: true }
    }),
  )
  r.use((error: Error, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof TerminalError)
      res.status(error.status).json({ error: { code: error.code, message: error.message } })
    else next(error)
  })
  return r
}
