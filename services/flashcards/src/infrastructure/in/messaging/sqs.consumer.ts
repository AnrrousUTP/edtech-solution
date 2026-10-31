// Plantilla obligatoria del doc 05 §6. La caché por hash y el estado del mazo
// hacen idempotente el efecto, así que el INSERT va en su propia transacción.
import {
  log,
  type Command,
  type CommandBus,
  type ResultadoMensaje,
  type SobreEvento,
} from '@edtech/shared-kernel'
import { onContenidoActualizado, onGenerarMazo } from './on-catalog.handler'

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
  'catalog.contenido-actualizado.v1': onContenidoActualizado,
  'flashcards.generar-mazo.interno': onGenerarMazo,
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
      log.error('payload inaplicable', { eventId: sobre.eventId, error: String(err) })
      return confirmar()
    }
    if (!comando) return confirmar()

    try {
      const r = await bus.dispatch(comando)
      if (r.ok) {
        const reintentable =
          comando._tag === 'GenerarMazo' &&
          typeof r.value === 'object' &&
          r.value !== null &&
          'estado' in r.value &&
          r.value.estado === 'GENERANDO'
        if (reintentable) {
          await inbox.releaseEvent(sobre.eventId, leaseToken)
          return 'NACK'
        }
        return confirmar()
      }
      log.error('evento inaplicable (error de negocio)', { eventId: sobre.eventId, error: r.error })
      return confirmar()
    } catch (err) {
      log.error('fallo de infraestructura procesando evento', {
        eventId: sobre.eventId,
        error: err instanceof Error ? err.message : String(err),
      })
      await inbox.releaseEvent(sobre.eventId, leaseToken)
      return 'NACK'
    }
  }
