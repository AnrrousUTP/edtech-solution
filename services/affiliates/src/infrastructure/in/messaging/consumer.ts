import { log, validarContra, type SobreEvento, type ResultadoMensaje } from '@edtech/shared-kernel'
import type { AfiliadosRepository } from '../../../domain/ports-out/afiliados.repository'
export const crearProcesador =
  (repo: AfiliadosRepository) =>
  async (sobre: SobreEvento): Promise<ResultadoMensaje> => {
    const validacion = validarContra(sobre.eventType, sobre.payload)
    if (!validacion.valido) {
      log.error('evento inválido', { errores: validacion.errores })
      return 'NACK'
    }
    try {
      await repo.procesar(sobre)
      return 'ACK'
    } catch (error) {
      log.error('comisión pendiente de reintento', { error: String(error) })
      return 'NACK'
    }
  }
