import type { NextFunction, Request, Response } from 'express'
import { log } from '../logger'
import { correlationIdActual } from './request-context'

/** Último eslabón de la cadena de Express: nada de dominio llega hasta acá.
 *  Si llega, es un bug de infraestructura y se responde 500 sin filtrar detalles. */
export const errorMiddleware = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const correlationId = correlationIdActual()
  log.error('error no controlado', {
    correlationId,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  })
  if (res.headersSent) return
  res.status(500).json({ error: { code: 'INTERNO', message: 'Error interno', correlationId } })
}

export const noEncontradoMiddleware = (_req: Request, res: Response): void => {
  res.status(404).json({ error: { code: 'NO_ENCONTRADO', message: 'Recurso no encontrado' } })
}
