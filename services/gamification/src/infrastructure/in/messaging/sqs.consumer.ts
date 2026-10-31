// Plantilla obligatoria del doc 05 §6. Los efectos son idempotentes por sus
// propias PK (insignias, certificados), así que el INSERT va en su propia
// transacción.
import {
  log,
  type Command,
  type CommandBus,
  type ResultadoMensaje,
  type SobreEvento,
} from '@edtech/shared-kernel'
import {
  onCarreraCompletada,
  onCursoCompletado,
  onEvaluacionAprobada,
  onGenerarPdf,
  onLeccionCompletada,
  onTomoCompletado,
  onUsuarioRegistrado,
} from './on-enrollment.handler'

type EventInbox = {
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
  'enrollment.carrera-completada.v1': onCarreraCompletada,
  'enrollment.leccion-completada.v1': onLeccionCompletada,
  'enrollment.tomo-completado.v1': onTomoCompletado,
  'enrollment.evaluacion-aprobada.v1': onEvaluacionAprobada,
  'identity.usuario-registrado.v1': onUsuarioRegistrado,
  'gamification.generar-pdf.interno': onGenerarPdf,
}

export const crearProcesador =
  (db: EventInbox, bus: CommandBus) =>
  async (sobre: SobreEvento): Promise<ResultadoMensaje> => {
    const reclamo = await db.claimEvent(sobre.eventId, sobre.eventType)
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
        if (!leaseToken || !db.markProcessed) throw new Error('Falta confirmar el lease del evento')
        await db.markProcessed(sobre.eventId, leaseToken)
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
      if (r.ok) return confirmar()
      log.error('evento inaplicable (error de negocio)', { eventId: sobre.eventId, error: r.error })
      return confirmar()
    } catch (err) {
      log.error('fallo de infraestructura procesando evento', {
        eventId: sobre.eventId,
        error: err instanceof Error ? err.message : String(err),
      })
      await db.releaseEvent(sobre.eventId, leaseToken)
      return 'NACK'
    }
  }
