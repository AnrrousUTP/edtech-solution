import {
  Err,
  Ok,
  UniqueId,
  isErr,
  type Command,
  type CommandHandler,
  type IEventPublisher,
  type Result,
} from '@edtech/shared-kernel'
import { Usuario } from '../../domain/entities/usuario.entity'
import { Email } from '../../domain/value-objects/email.vo'
import type { UsuarioRepository } from '../../domain/ports-out/usuario.repository'
import type { EmailInvalidoError } from '../../domain/module.errors'

export type CrearUsuarioCommand = Command & {
  readonly _tag: 'CrearUsuario'
  readonly sub: string
  readonly email: string
  readonly nombreVisible: string
}

export type CrearUsuarioResponse = { creado: boolean }

/** Alta desde Cognito (post-confirmation o alta perezosa). Idempotente:
 *  si el usuario ya existe, no hace nada y no re-publica el evento. */
export class CrearUsuarioHandler implements CommandHandler<
  CrearUsuarioCommand,
  CrearUsuarioResponse,
  EmailInvalidoError
> {
  readonly handles = 'CrearUsuario' as const

  constructor(
    private readonly usuarios: UsuarioRepository,
    private readonly publisher: IEventPublisher,
  ) {}

  async execute(
    cmd: CrearUsuarioCommand,
  ): Promise<Result<CrearUsuarioResponse, EmailInvalidoError>> {
    const id = UniqueId.desde(cmd.sub)

    const existente = await this.usuarios.porId(id)
    if (existente) return Ok({ creado: false })

    const email = Email.crear(cmd.email)
    if (isErr(email)) return Err(email.error)

    const nombre = cmd.nombreVisible.trim() || email.value.valor.split('@')[0] || 'Estudiante'
    const usuario = Usuario.crearDesdeCognito(id, email.value, nombre)

    await this.usuarios.guardar(usuario)
    await this.publisher.publish(usuario.pullEvents())
    return Ok({ creado: true })
  }
}
