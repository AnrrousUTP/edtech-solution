// Dos entradas de mensajería (doc 09 §4, doc 05 §6):
//   - cola del bus (edtech-dev-payments): eventos de catalog → proyección de precios
//   - cola interna (edtech-dev-payments-webhooks): webhooks de PayPal → worker
// Idempotencia en dos capas: paypal_event_id (contra PayPal) y
// processed_events.event_id (contra las reentregas de SQS).
import {
  log,
  type Command,
  type CommandBus,
  type ResultadoMensaje,
  type SobreEvento,
} from '@edtech/shared-kernel'
import type { WebhookRepository } from '../../../domain/ports-out/orden.repository'
import type {
  DespublicarPrecioCommand,
  ProyectarPrecioCommand,
} from '../../../application/consultar-ordenes/consultar-ordenes.handler'
import type { ProcesarWebhookCommand } from '../../../application/procesar-webhook/procesar-webhook.handler'
import type { Db } from '../../out/persistencia/db'

export const onCursoPublicado = (sobre: SobreEvento): Command => {
  const p = sobre.payload
  const cmd: ProyectarPrecioCommand = {
    _tag: 'ProyectarPrecio',
    cursoId: String(p.cursoId),
    titulo: String(p.titulo),
    monto: Number(p.precio),
    moneda: String(p.moneda),
    versionPrecio: Number(p.versionPrecio),
    publicado: true,
  }
  return cmd
}

export const onPrecioActualizado = (sobre: SobreEvento): Command => {
  const p = sobre.payload
  const cmd: ProyectarPrecioCommand = {
    _tag: 'ProyectarPrecio',
    cursoId: String(p.cursoId),
    titulo: String(p.titulo ?? ''),
    monto: Number(p.montoNuevo),
    moneda: String(p.moneda),
    versionPrecio: Number(p.versionPrecio),
    publicado: true,
  }
  return cmd
}

export const onCursoDespublicado = (sobre: SobreEvento): Command => {
  const cmd: DespublicarPrecioCommand = {
    _tag: 'DespublicarPrecio',
    cursoId: String(sobre.payload.cursoId),
  }
  return cmd
}

const HANDLERS: Record<string, (sobre: SobreEvento) => Command | null> = {
  'catalog.curso-publicado.v1': onCursoPublicado,
  'catalog.precio-actualizado.v1': onPrecioActualizado,
  'catalog.curso-despublicado.v1': onCursoDespublicado,
}

export const crearProcesador =
  (db: Db, bus: CommandBus, webhooks: WebhookRepository) =>
  async (sobre: SobreEvento): Promise<ResultadoMensaje> => {
    const insertado = await db.claimEvent(sobre.eventId, sobre.eventType)
    if (!insertado) {
      log.info('evento ya procesado', { eventId: sobre.eventId })
      return 'ACK'
    }

    // Cola interna de webhooks: el mensaje solo trae el id; el crudo está en la
    // bitácora, que se escribió antes de encolar y sobrevive a cualquier fallo.
    if (sobre.eventType === 'payments.webhook-recibido.interno') {
      const paypalEventId = String(sobre.payload.paypalEventId)
      const webhook = await webhooks.porEventId(paypalEventId)
      if (!webhook) {
        log.error('webhook encolado sin fila en la bitácora', { paypalEventId })
        return 'ACK'
      }
      if (!webhook.firmaValida) {
        log.error('webhook con firma inválida llegó al worker: no se procesa', { paypalEventId })
        return 'ACK'
      }
      const payload = webhook.payload as { resource?: Record<string, unknown> }
      const cmd: ProcesarWebhookCommand = {
        _tag: 'ProcesarWebhook',
        paypalEventId,
        eventType: webhook.eventType,
        recurso: payload.resource ?? {},
      }
      try {
        const r = await bus.dispatch(cmd)
        if (r.ok) return 'ACK'
        log.error('webhook inaplicable (error de negocio)', { paypalEventId, error: r.error })
        return 'ACK'
      } catch (err) {
        log.error('fallo de infraestructura procesando webhook', {
          paypalEventId,
          error: err instanceof Error ? err.message : String(err),
        })
        await db.releaseEvent(sobre.eventId)
        return 'NACK' // reintento de SQS → DLQ a la quinta
      }
    }

    const traducir = HANDLERS[sobre.eventType]
    if (!traducir) {
      log.warn('evento sin handler', { eventType: sobre.eventType })
      return 'ACK'
    }

    let comando: Command | null
    try {
      comando = traducir(sobre)
    } catch (err) {
      log.error('payload inaplicable', { eventId: sobre.eventId, error: String(err) })
      return 'ACK'
    }
    if (!comando) return 'ACK'

    try {
      const r = await bus.dispatch(comando)
      if (r.ok) return 'ACK'
      log.error('evento inaplicable (error de negocio)', { eventId: sobre.eventId, error: r.error })
      return 'ACK'
    } catch (err) {
      log.error('fallo de infraestructura procesando evento', {
        eventId: sobre.eventId,
        error: err instanceof Error ? err.message : String(err),
      })
      await db.releaseEvent(sobre.eventId)
      return 'NACK'
    }
  }
