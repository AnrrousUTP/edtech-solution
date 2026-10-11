import { log, validarContra, type SobreEvento, type ResultadoMensaje } from '@edtech/shared-kernel'
import type { TerminalRepository } from '../../../domain/ports-out/terminal.repository'
export const crearProcesador =
  (repo: TerminalRepository, deviceId: string) =>
  async (s: SobreEvento): Promise<ResultadoMensaje> => {
    if (s.eventType === 'iot.telemetry.interno') {
      if (
        s.payload.deviceId !== deviceId ||
        !Number.isSafeInteger(s.payload.version) ||
        Number(s.payload.version) < 0
      )
        return 'NACK'
    } else if (!validarContra(s.eventType, s.payload).valido) return 'NACK'
    try {
      await repo.procesar(s)
      return 'ACK'
    } catch (error) {
      log.error('terminal pendiente', { error: String(error) })
      return 'NACK'
    }
  }
