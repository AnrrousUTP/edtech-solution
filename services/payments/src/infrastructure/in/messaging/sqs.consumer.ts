// Consume cambios del catálogo y actualiza la proyección local de precios.
import {
  log,
  type Command,
  type CommandBus,
  type ResultadoMensaje,
  type SobreEvento,
} from '@edtech/shared-kernel'
import type {
  DespublicarPrecioCommand,
  ProyectarPrecioCommand,
} from '../../../application/consultar-ordenes/consultar-ordenes.handler'

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
    eventId: sobre.eventId,
    eventType: sobre.eventType,
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
    eventId: sobre.eventId,
    eventType: sobre.eventType,
  }
  return cmd
}

export const onCursoDespublicado = (sobre: SobreEvento): Command => {
  const cmd: DespublicarPrecioCommand = {
    _tag: 'DespublicarPrecio',
    cursoId: String(sobre.payload.cursoId),
    eventId: sobre.eventId,
    eventType: sobre.eventType,
  }
  return cmd
}

const HANDLERS: Record<string, (sobre: SobreEvento) => Command | null> = {
  'catalog.curso-publicado.v1': onCursoPublicado,
  'catalog.precio-actualizado.v1': onPrecioActualizado,
  'catalog.curso-despublicado.v1': onCursoDespublicado,
}

export const crearProcesador =
  (bus: CommandBus) =>
  async (sobre: SobreEvento): Promise<ResultadoMensaje> => {
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
