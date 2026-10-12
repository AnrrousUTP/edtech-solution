import type { UniqueId } from '@edtech/shared-kernel'
import type { IntentoEvaluacion } from '../entities/intento-evaluacion.entity'
import type { Matricula } from '../entities/matricula.entity'

export interface IntentoRepository {
  porId(id: UniqueId): Promise<IntentoEvaluacion | null>
  guardar(intento: IntentoEvaluacion): Promise<void>
  /** Persiste una entrega aprobada y el progreso que origina dentro de una transacción. */
  guardarEntregaConProgreso?(intento: IntentoEvaluacion, matricula: Matricula): Promise<void>
  ultimoNivelacionDe(usuarioId: UniqueId): Promise<IntentoEvaluacion | null>
  ultimoEvaluacionInicialDe(
    usuarioId: UniqueId,
    cursoId: UniqueId,
  ): Promise<IntentoEvaluacion | null>
}
