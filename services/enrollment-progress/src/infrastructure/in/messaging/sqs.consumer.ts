// Consumidor SQS con la plantilla obligatoria del doc 05 §6. Los efectos son
// idempotentes por sí mismos (unique usuario+curso, PKs compuestas, upserts),
// así que el INSERT de processed_events va en su propia transacción.
import {
  log,
  type Command,
  type CommandBus,
  type ResultadoMensaje,
  type SobreEvento,
} from '@edtech/shared-kernel'
import { onPagoConfirmado, onPagoReembolsado } from './on-pago.handler'
import { onContenidoActualizado, onCursoDespublicado, onCursoPublicado } from './on-catalog.handler'
import { processedEvents } from '../../out/persistencia/schema'
import type { Db } from '../../out/persistencia/db'

const HANDLERS: Record<string, (sobre: SobreEvento) => Command | null> = {
  'payments.pago-confirmado.v1': onPagoConfirmado,
  'payments.pago-reembolsado.v1': onPagoReembolsado,
  'catalog.curso-publicado.v1': onCursoPublicado,
  'catalog.curso-despublicado.v1': onCursoDespublicado,
  'catalog.contenido-actualizado.v1': onContenidoActualizado,
}

export const crearProcesador =
  (db: Db, bus: CommandBus) =>
  async (sobre: SobreEvento): Promise<ResultadoMensaje> => {
    const insertado = await db
      .insert(processedEvents)
      .values({ eventId: sobre.eventId, eventType: sobre.eventType, resultado: 'OK' })
      .onConflictDoNothing()
      .returning({ id: processedEvents.eventId })
    if (insertado.length === 0) {
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
      return 'NACK'
    }
  }
