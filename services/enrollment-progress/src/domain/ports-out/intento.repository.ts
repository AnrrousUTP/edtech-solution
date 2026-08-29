import type { UniqueId } from '@edtech/shared-kernel'
import type { IntentoEvaluacion } from '../entities/intento-evaluacion.entity'

export interface IntentoRepository {
  porId(id: UniqueId): Promise<IntentoEvaluacion | null>
  guardar(intento: IntentoEvaluacion): Promise<void>
  ultimoNivelacionDe(usuarioId: UniqueId): Promise<IntentoEvaluacion | null>
}
