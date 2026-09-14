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
import type { Db } from '../../out/persistencia/db'

const HANDLERS: Record<string, (sobre: SobreEvento) => Command | null> = {
  'catalog.contenido-actualizado.v1': onContenidoActualizado,
  'flashcards.generar-mazo.interno': onGenerarMazo,
}

export const crearProcesador =
  (db: Db, bus: CommandBus) =>
  async (sobre: SobreEvento): Promise<ResultadoMensaje> => {
    const insertado = await db.claimEvent(sobre.eventId, sobre.eventType)
    if (!insertado) {
      log.info('evento ya procesado', { eventId: sobre.eventId })
      return 'ACK'
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
