import type { UniqueId } from '@edtech/shared-kernel'
import type { Carrera } from '../entities/carrera.entity'

export interface CarreraRepository {
  porId(id: UniqueId): Promise<Carrera | null>
  todas(): Promise<Carrera[]>
  guardar(carrera: Carrera): Promise<void>
}
