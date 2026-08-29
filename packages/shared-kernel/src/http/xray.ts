import { createSocket } from 'node:dgram'
import type { NextFunction, Request, Response } from 'express'
import { correlationIdActual } from './request-context'

// Traza distribuida (doc 07 §8). Se habla UDP directo con el daemon de X-Ray en
// vez de traer el SDK: el SDK pesa, parchea el runtime y aquí sólo hace falta un
// segmento por petición con el `correlationId` como anotación — que es
// exactamente lo que el doc pide para poder seguir un evento a través de
// EventBridge y SQS.
//
// Sin AWS_XRAY_DAEMON_ADDRESS (local, tests) todo esto es un no-op.

const CABECERA = '{"format":"json","version":1}\n'

type Destino = { host: string; puerto: number }

const leerDestino = (): Destino | null => {
  const bruto = process.env.AWS_XRAY_DAEMON_ADDRESS
  if (bruto === undefined || bruto === '') return null
  const [host, puerto] = bruto.split(':')
  if (host === undefined || puerto === undefined) return null
  return { host, puerto: Number(puerto) }
}

const hex = (bytes: number): string =>
  [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

/** Id de traza propio, con el formato que exige X-Ray: `1-<epoch hex>-<96 bits>`. */
const nuevoTraceId = (): string => `1-${Math.floor(Date.now() / 1000).toString(16)}-${hex(12)}`

/**
 * El ALB inyecta `X-Amzn-Trace-Id: Root=1-…;Parent=…`. Respetarlo es lo que hace
 * que la traza sea UNA sola a lo largo de todo el salto, en vez de una por servicio.
 */
export const trazaDeCabecera = (
  cabecera: string | undefined,
): { traceId: string; parentId?: string } => {
  if (cabecera === undefined) return { traceId: nuevoTraceId() }
  const partes = Object.fromEntries(
    cabecera.split(';').map(p => {
      const [k, v] = p.trim().split('=')
      return [k ?? '', v ?? '']
    }),
  )
  const raiz = partes.Root
  if (raiz === undefined || raiz === '') return { traceId: nuevoTraceId() }
  return partes.Parent !== undefined && partes.Parent !== ''
    ? { traceId: raiz, parentId: partes.Parent }
    : { traceId: raiz }
}

const enviar = (segmento: Record<string, unknown>, destino: Destino): void => {
  const socket = createSocket('udp4')
  const datos = Buffer.from(CABECERA + JSON.stringify(segmento))
  socket.send(datos, destino.puerto, destino.host, () => socket.close())
  // Un fallo del daemon nunca puede tumbar la petición que se está trazando
  socket.on('error', () => socket.close())
}

/**
 * Middleware: abre un segmento al entrar y lo cierra al terminar la respuesta.
 * Va DESPUÉS de requestContextMiddleware, para que el correlationId ya exista.
 */
export const xrayMiddleware =
  (nombreServicio: string) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const destino = leerDestino()
    if (destino === null) {
      next()
      return
    }

    const { traceId, parentId } = trazaDeCabecera(
      req.headers['x-amzn-trace-id'] as string | undefined,
    )
    const id = hex(8)
    const inicio = Date.now() / 1000

    res.on('finish', () => {
      enviar(
        {
          name: nombreServicio,
          id,
          trace_id: traceId,
          ...(parentId !== undefined ? { parent_id: parentId, type: 'subsegment' } : {}),
          start_time: inicio,
          end_time: Date.now() / 1000,
          http: {
            request: { method: req.method, url: req.originalUrl },
            response: { status: res.statusCode },
          },
          ...(res.statusCode >= 500 ? { fault: true } : {}),
          ...(res.statusCode >= 400 && res.statusCode < 500 ? { error: true } : {}),
          // Lo que hace la traza útil aquí: la misma clave que sale en los logs
          // y que viaja dentro del sobre de cada evento.
          annotations: { correlationId: correlationIdActual() },
        },
        destino,
      )
    })

    next()
  }
