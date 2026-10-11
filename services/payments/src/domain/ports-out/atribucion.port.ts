import type { Result } from '@edtech/shared-kernel'
import type { PaymentsError } from '../module.errors'
export type AtribucionReferida = {
  afiliadoId: string
  afiliadoUsuarioId: string
  visitaId: string
  refId: string
  compradorId: string
  politica: 'ultimo-referido-30d-v1'
  tasaBps: 500
}
export interface VerificadorAtribucionPort {
  verificar(prueba: string, compradorId: string): Promise<Result<AtribucionReferida, PaymentsError>>
}
