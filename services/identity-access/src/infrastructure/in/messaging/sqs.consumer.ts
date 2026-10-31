// Consumidor SQS: idempotencia por processed_events + traducción evento→Command
// (plantilla obligatoria del doc 05 §6). Los efectos de este servicio son
// idempotentes por sí mismos (upsert, max de nivel), así que el INSERT va en su
// propia transacción, como documenta la decisión 1 de esa plantilla.
import {
  log,
  type Command,
  type CommandBus,
  type ResultadoMensaje,
  type SobreEvento,
} from '@edtech/shared-kernel'
import { onAltaUsuarioCognito } from './on-alta-usuario-cognito.handler'
import { onCursoCompletado } from './on-curso-completado.handler'
import { onTestNivelacionCompletado } from './on-test-nivelacion-completado.handler'

export type EventInbox = {
  claimEvent(
    eventId: string,
    eventType: string,
  ): Promise<
    boolean | { status: 'CLAIMED'; token: string } | { status: 'IN_PROGRESS' | 'PROCESSED' }
  >
  markProcessed?: (eventId: string, token: string) => Promise<void>
  releaseEvent(eventId: string, token?: string): Promise<void>
}

const HANDLERS: Record<string, (sobre: SobreEvento) => Command | null> = {
  'enrollment.curso-completado.v1': onCursoCompletado,
  'enrollment.test-nivelacion-completado.v1': onTestNivelacionCompletado,
  'identity.alta-usuario-cognito.v1': onAltaUsuarioCognito,
}

export const crearProcesador =
  (inbox: EventInbox, bus: CommandBus) =>
  async (sobre: SobreEvento): Promise<ResultadoMensaje> => {
    const reclamo = await inbox.claimEvent(sobre.eventId, sobre.eventType)
    if (typeof reclamo === 'boolean') {
      if (!reclamo) {
        log.info('evento ya procesado', { eventId: sobre.eventId })
        return 'ACK'
      }
    } else if (reclamo.status !== 'CLAIMED') {
      log.info(
        reclamo.status === 'PROCESSED'
          ? 'evento ya procesado'
          : 'evento ya en proceso; se conserva el mensaje original',
        { eventId: sobre.eventId },
      )
      return 'ACK'
    }
    const usaLease = typeof reclamo !== 'boolean'
    const leaseToken = typeof reclamo === 'boolean' ? undefined : reclamo.token
    const confirmar = async (): Promise<ResultadoMensaje> => {
      if (usaLease) {
        if (!leaseToken || !inbox.markProcessed)
          throw new Error('Falta confirmar el lease del evento')
        await inbox.markProcessed(sobre.eventId, leaseToken)
      }
      return 'ACK'
    }

    const traducir = HANDLERS[sobre.eventType]
    if (!traducir) {
      log.warn('evento sin handler', { eventType: sobre.eventType })
      return confirmar()
    }

    let comando: Command | null
    try {
      comando = traducir(sobre)
    } catch (err) {
      // payload malformado: reintentar no lo arregla
      log.error('payload inaplicable', { eventId: sobre.eventId, error: String(err) })
      return confirmar()
    }
    if (!comando) return confirmar()

    try {
      const r = await bus.dispatch(comando)
      if (r.ok) return confirmar()
      // error de negocio: registrar y seguir (no reintentar lo irreparable)
      log.error('evento inaplicable', { eventId: sobre.eventId, error: r.error })
      return confirmar()
    } catch (err) {
      // error de infraestructura → NACK → SQS reintenta → DLQ
      log.error('fallo de infraestructura procesando evento', {
        eventId: sobre.eventId,
        error: err instanceof Error ? err.message : String(err),
      })
      await inbox.releaseEvent(sobre.eventId, leaseToken)
      return 'NACK'
    }
  }
