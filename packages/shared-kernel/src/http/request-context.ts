import { AsyncLocalStorage } from 'node:async_hooks'
import type { NextFunction, Request, Response } from 'express'

export type RequestContext = {
  correlationId: string
  usuarioId?: string
  roles?: string[]
}

const almacen = new AsyncLocalStorage<RequestContext>()

export const contextoActual = (): RequestContext | undefined => almacen.getStore()

export const correlationIdActual = (): string =>
  almacen.getStore()?.correlationId ?? `sin-contexto-${crypto.randomUUID()}`

/** Corre un bloque con un contexto dado (pollers SQS, workers). */
export const conContexto = <T>(ctx: RequestContext, fn: () => T): T => almacen.run(ctx, fn)

/** Middleware: siembra el correlationId desde el header o lo genera. */
export const requestContextMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const correlationId =
    (req.headers['x-correlation-id'] as string | undefined) ?? `req-${crypto.randomUUID()}`
  res.setHeader('x-correlation-id', correlationId)
  almacen.run({ correlationId }, next)
}

/** Los middlewares de auth completan el contexto una vez validado el JWT. */
export const asignarIdentidad = (usuarioId: string, roles: string[]): void => {
  const ctx = almacen.getStore()
  if (ctx) {
    ctx.usuarioId = usuarioId
    ctx.roles = roles
  }
}
