import {
  Err,
  Ok,
  UniqueId,
  type IEventPublisher,
  type Query,
  type QueryHandler,
  type Result,
} from '@edtech/shared-kernel'
import { UsuarioNoEncontradoError, type IdentityError } from '../../domain/module.errors'
import type { UsuarioRepository } from '../../domain/ports-out/usuario.repository'
import { Usuario } from '../../domain/entities/usuario.entity'
import { Email } from '../../domain/value-objects/email.vo'

export type ObtenerPerfilQuery = Query & {
  readonly _tag: 'ObtenerPerfil'
  readonly usuarioId: string
  /** Alta perezosa (doc 08 §4.3): si viene el email del token y el usuario no
   *  existe, se crea en el momento — un JWT válido de Cognito es prueba
   *  suficiente de que el usuario existe. */
  readonly altaPerezosa?: { email: string; nombreVisible?: string }
}

export type PerfilResponse = {
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

export class ObtenerPerfilHandler implements QueryHandler<
  ObtenerPerfilQuery,
  PerfilResponse,
  IdentityError
> {
  readonly handles = 'ObtenerPerfil' as const

  constructor(
    private readonly usuarios: UsuarioRepository,
    private readonly publisher: IEventPublisher,
  ) {}

  async execute(query: ObtenerPerfilQuery): Promise<Result<PerfilResponse, IdentityError>> {
    const id = UniqueId.desde(query.usuarioId)
    let usuario = await this.usuarios.porId(id)

    if (!usuario && query.altaPerezosa) {
      const email = Email.crear(query.altaPerezosa.email)
      if (email.ok) {
        usuario = Usuario.crearDesdeCognito(
          id,
          email.value,
          query.altaPerezosa.nombreVisible ?? email.value.valor.split('@')[0] ?? 'Estudiante',
        )
        await this.usuarios.guardar(usuario)
        await this.publisher.publish(usuario.pullEvents())
      }
    }

    if (!usuario) return Err(new UsuarioNoEncontradoError(query.usuarioId))
    return Ok({
      id: usuario.id.valor,
      email: usuario.email.valor,
      nombreVisible: usuario.nombreVisible,
      avatarUrl: usuario.avatarUrl,
      pais: usuario.pais,
      idioma: usuario.idioma,
      rol: usuario.rol,
      nivel: usuario.nivel.valor,
      origenNivel: usuario.origenNivel,
    })
  }
}
