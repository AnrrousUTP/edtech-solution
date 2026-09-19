import { Ok, type Query, type QueryHandler, type Result } from '@edtech/shared-kernel'
import type { IdentityError } from '../../domain/module.errors'
import type { UsuarioRepository } from '../../domain/ports-out/usuario.repository'

export type ListarUsuariosQuery = Query & { readonly _tag: 'ListarUsuarios' }

export type UsuarioListado = {
  id: string
  email: string
  nombreVisible: string
  avatarUrl: string | null
  pais: string | null
  idioma: string
  rol: string
  nivel: string
  origenNivel: string
}

export class ListarUsuariosHandler implements QueryHandler<
  ListarUsuariosQuery,
  UsuarioListado[],
  IdentityError
> {
  readonly handles = 'ListarUsuarios' as const

  constructor(private readonly usuarios: UsuarioRepository) {}

  async execute(_query: ListarUsuariosQuery): Promise<Result<UsuarioListado[], IdentityError>> {
    const usuarios = await this.usuarios.todos()
    return Ok(
      usuarios.map(usuario => ({
        id: usuario.id.valor,
        email: usuario.email.valor,
        nombreVisible: usuario.nombreVisible,
        avatarUrl: usuario.avatarUrl,
        pais: usuario.pais,
        idioma: usuario.idioma,
        rol: usuario.rol,
        nivel: usuario.nivel.valor,
        origenNivel: usuario.origenNivel,
      })),
    )
  }
}
