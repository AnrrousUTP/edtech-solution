import {
  log,
  type CommandBus,
  type ResultadoMensaje,
  type SobreEvento,
} from '@edtech/shared-kernel'
import type { WebhookRepository } from '../../../domain/ports-out/orden.repository'

const EVENTO_WEBHOOK = 'payments.webhook-recibido.interno'

export const crearProcesadorWebhooks =
  (bus: CommandBus, webhooks: WebhookRepository) =>
  async (sobre: SobreEvento): Promise<ResultadoMensaje> => {
    if (sobre.eventType !== EVENTO_WEBHOOK) {
      log.warn('evento inesperado en la cola de webhooks de pagos', {
        eventType: sobre.eventType,
      })
      return 'ACK'
    }

    const paypalEventId = String(sobre.payload.paypalEventId ?? sobre.aggregateId ?? '')
    if (!paypalEventId) return 'NACK'

    try {
      const webhook = await webhooks.porEventId(paypalEventId)
      if (!webhook) {
        log.error('no se encontró el webhook recibido en la bitácora', { paypalEventId })
        return 'NACK'
      }
      if (!webhook.firmaValida) {
        log.error('webhook inválido descartado por el consumidor', { paypalEventId })
        return 'ACK'
      }

      const payload =
        typeof webhook.payload === 'string'
          ? (JSON.parse(webhook.payload) as { resource?: unknown })
          : (webhook.payload as { resource?: unknown })
      if (
        !payload ||
        typeof payload !== 'object' ||
        !payload.resource ||
        typeof payload.resource !== 'object' ||
        Array.isArray(payload.resource)
      ) {
        await webhooks.marcarProcesado(paypalEventId, 'payload PayPal sin resource')
        return 'ACK'
      }

      const resultado = await bus.dispatch<unknown, Error>({
        _tag: 'ProcesarWebhook',
        paypalEventId,
        eventType: webhook.eventType,
        recurso: payload.resource as Record<string, unknown>,
      })
      if (!resultado.ok) {
        log.error('webhook PayPal descartado por error de negocio', {
          paypalEventId,
          error: resultado.error.message,
        })
      }
      return 'ACK'
    } catch (error) {
      log.error('fallo de infraestructura procesando webhook de PayPal', {
        paypalEventId,
        error: error instanceof Error ? error.message : String(error),
      })
      return 'NACK'
    }
  }
