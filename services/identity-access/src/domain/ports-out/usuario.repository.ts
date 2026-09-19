import type { UniqueId } from '@edtech/shared-kernel'
import type { Usuario } from '../entities/usuario.entity'

export interface UsuarioRepository {
  porId(id: UniqueId): Promise<Usuario | null>
  todos(): Promise<Usuario[]>
  guardar(usuario: Usuario): Promise<void>
}
