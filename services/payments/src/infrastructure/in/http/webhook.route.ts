// El endpoint del webhook, montado con express.raw ANTES del express.json
// global (doc 09 §3). Si Express parsea el cuerpo y se re-serializa, la firma
// NO valida: es el error más común de esta integración y deja todos los pagos
// sin confirmar.
import { log } from '@edtech/shared-kernel'
import { Router, raw, type Request, type Response } from 'express'
import type { WebhookRepository, ColaWebhooks } from '../../../domain/ports-out/orden.repository'
import type { PasarelaPagoPort } from '../../../domain/ports-out/pasarela-pago.port'

export const crearRutaWebhook = (
  pasarela: PasarelaPagoPort,
  webhooks: WebhookRepository,
  cola: ColaWebhooks,
): Router => {
  const router = Router()

  router.post(
    '/webhook',
    raw({ type: 'application/json', limit: '1mb' }),
    async (req: Request, res: Response) => {
      const cuerpoCrudo = Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : typeof req.body === 'string'
          ? req.body
          : ''

      let evento: { id?: string; event_type?: string }
      try {
        evento = JSON.parse(cuerpoCrudo) as { id?: string; event_type?: string }
      } catch {
        log.error('webhook con cuerpo no-JSON')
        res.status(200).json({ recibido: true }) // no confirmar la sonda
        return
      }

      const paypalEventId = evento.id ?? ''
      const eventType = evento.event_type ?? 'DESCONOCIDO'
      if (!paypalEventId) {
        res.status(200).json({ recibido: true })
        return
      }

      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') headers[k.toLowerCase()] = v
      }

      const firmaValida = await pasarela.verificarFirmaWebhook(headers, cuerpoCrudo)

      // Se registra ANTES de procesar y sobrevive a cualquier fallo posterior.
      // El UNIQUE de paypal_event_id descarta el reintento de PayPal (doc 09 §4).
      const esNuevo = await webhooks.registrarSiEsNuevo({
        paypalEventId,
        eventType,
        firmaValida,
        payload: JSON.parse(cuerpoCrudo),
      })

      if (!firmaValida) {
        // Registrado con firma_valida=false, NO procesado, y se responde 200:
        // un 400 le diría al atacante que su sonda llegó (doc 09 §3).
        log.error('webhook con firma inválida: registrado y descartado', {
          paypalEventId,
          eventType,
        })
        res.status(200).json({ recibido: true })
        return
      }

      if (esNuevo) await cola.encolar(paypalEventId)
      else log.info('webhook repetido de PayPal: ya estaba registrado', { paypalEventId })

      // Responder en < 200 ms: el trabajo lo hace el worker (doc 09 §4)
      res.status(200).json({ recibido: true })
    },
  )

  return router
}
