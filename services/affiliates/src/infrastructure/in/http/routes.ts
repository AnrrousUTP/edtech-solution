import { requiereAuth, requiereRol } from '@edtech/shared-kernel'
import { Router, json, type Request, type Response, type NextFunction } from 'express'
import type { AfiliacionHandler } from '../../../application/afiliacion/afiliacion.handler'
import { AfiliacionError } from '../../../domain/module.errors'
import type { Config } from '../../config/config'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const esUuid = (value: string): boolean => uuid.test(value)
const optionalId = (v: unknown): string | undefined =>
  typeof v === 'string' && esUuid(v) ? v : undefined
const fecha = (v: unknown): string | undefined => {
  if (v === undefined) return undefined
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)))
    throw new AfiliacionError('FECHA_INVALIDA', 'Usa fechas válidas con formato AAAA-MM-DD')
  return v
}
export const crearRouter = (handler: AfiliacionHandler, cfg: Config): Router => {
  const r = Router()
  r.use(json({ limit: '16kb' }))
  const auth = requiereAuth({ issuer: cfg.issuer, clientId: cfg.clientId, jwksUri: cfg.jwksUri })
  const wrap =
    (f: (req: Request) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction): void => {
      void f(req)
        .then(data => res.json({ data }))
        .catch(next)
    }
  const repo = handler.repositorio
  r.post(
    '/referidos/:refId/visitas',
    wrap(async req => {
      if (!esUuid(String(req.params.refId)))
        throw new AfiliacionError('REFERIDO_INVALIDO', 'Este enlace no está activo', 404)
      return repo.visitar(String(req.params.refId), optionalId(req.body?.visitaAnterior))
    }),
  )
  r.get(
    '/me',
    auth,
    wrap(req => repo.porUsuario(req.auth!.usuarioId)),
  )
  r.post(
    '/me',
    auth,
    wrap(req => repo.activar(req.auth!.usuarioId)),
  )
  r.put(
    '/me',
    auth,
    wrap(async req => {
      const slug = req.body?.cursoSlug
      if (slug !== null && (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)))
        throw new AfiliacionError('CURSO_INVALIDO', 'Curso inválido')
      await repo.configurar(req.auth!.usuarioId, slug)
      return { actualizado: true }
    }),
  )
  r.post(
    '/atribucion',
    auth,
    wrap(req => handler.prueba(req.auth!.usuarioId, optionalId(req.body?.visitaId))),
  )
  r.get(
    '/ingresos',
    auth,
    wrap(req =>
      repo.resumen(
        req.auth!.usuarioId,
        fecha(req.query.desde),
        fecha(req.query.hasta),
        optionalId(req.query.cursor),
      ),
    ),
  )
  r.get(
    '/notificaciones',
    auth,
    wrap(req => repo.notificaciones(req.auth!.usuarioId)),
  )
  r.post(
    '/notificaciones/:id/leida',
    auth,
    wrap(async req => {
      const id = optionalId(req.params.id)
      if (!id || !(await repo.leerNotificacion(req.auth!.usuarioId, id)))
        throw new AfiliacionError('NO_ENCONTRADA', 'Notificación no encontrada', 404)
      return { leida: true }
    }),
  )
  r.get(
    '/admin',
    auth,
    requiereRol('admin'),
    wrap(() => repo.admin()),
  )
  r.put(
    '/admin/:id',
    auth,
    requiereRol('admin'),
    wrap(async req => {
      const id = optionalId(req.params.id)
      if (!id || typeof req.body?.activo !== 'boolean')
        throw new AfiliacionError('DATOS_INVALIDOS', 'Indica un afiliado y su estado')
      await repo.estadoAfiliado(id, req.body.activo)
      return { actualizado: true }
    }),
  )
  r.use((error: Error, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof AfiliacionError)
      res.status(error.status).json({ error: { code: error.code, message: error.message } })
    else next(error)
  })
  return r
}
