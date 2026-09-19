import type { UniqueId } from '@edtech/shared-kernel'
import type { PerfilGamificacion } from '../entities/perfil-gamificacion.entity'

export interface PerfilRepository {
  porUsuario(usuarioId: UniqueId): Promise<PerfilGamificacion | null>
  todos(): Promise<PerfilGamificacion[]>
  guardar(perfil: PerfilGamificacion): Promise<void>
}
