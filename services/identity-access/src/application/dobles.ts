import type { UniqueId } from '@edtech/shared-kernel'
import type { Usuario } from '../domain/entities/usuario.entity'
import type { UsuarioRepository } from '../domain/ports-out/usuario.repository'

/** Doble de test del repositorio (doc 04 §11): en memoria, sin mocks. */
export class InMemoryUsuarioRepository implements UsuarioRepository {
  readonly guardados = new Map<string, Usuario>()

  async porId(id: UniqueId): Promise<Usuario | null> {
    return this.guardados.get(id.valor) ?? null
  }

  async todos(): Promise<Usuario[]> {
    return [...this.guardados.values()]
  }

  async guardar(usuario: Usuario): Promise<void> {
    this.guardados.set(usuario.id.valor, usuario)
  }
}
