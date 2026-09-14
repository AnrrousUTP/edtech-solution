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
import type { Db } from '../../out/persistencia/db'

const HANDLERS: Record<string, (sobre: SobreEvento) => Command | null> = {
  'enrollment.curso-completado.v1': onCursoCompletado,
  'enrollment.test-nivelacion-completado.v1': onTestNivelacionCompletado,
  'identity.alta-usuario-cognito.v1': onAltaUsuarioCognito,
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
      // payload malformado: reintentar no lo arregla
      log.error('payload inaplicable', { eventId: sobre.eventId, error: String(err) })
      return 'ACK'
    }
    if (!comando) return 'ACK'

    try {
      const r = await bus.dispatch(comando)
      if (r.ok) return 'ACK'
      // error de negocio: registrar y seguir (no reintentar lo irreparable)
      log.error('evento inaplicable', { eventId: sobre.eventId, error: r.error })
      return 'ACK'
    } catch (err) {
      // error de infraestructura → NACK → SQS reintenta → DLQ
      log.error('fallo de infraestructura procesando evento', {
        eventId: sobre.eventId,
        error: err instanceof Error ? err.message : String(err),
      })
      await db.releaseEvent(sobre.eventId)
      return 'NACK'
    }
  }
