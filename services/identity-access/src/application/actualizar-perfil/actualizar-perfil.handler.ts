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
import type { CambiosPerfil } from '../../domain/entities/usuario.entity'
import { UsuarioNoEncontradoError, type IdentityError } from '../../domain/module.errors'
import type { UsuarioRepository } from '../../domain/ports-out/usuario.repository'

export type ActualizarPerfilCommand = Command & {
  readonly _tag: 'ActualizarPerfil'
  readonly usuarioId: string
  readonly cambios: CambiosPerfil
}

export type ActualizarPerfilResponse = { actualizado: boolean }

export class ActualizarPerfilHandler implements CommandHandler<
  ActualizarPerfilCommand,
  ActualizarPerfilResponse,
  IdentityError
> {
  readonly handles = 'ActualizarPerfil' as const

  constructor(
    private readonly usuarios: UsuarioRepository,
    private readonly publisher: IEventPublisher,
  ) {}

  async execute(
    cmd: ActualizarPerfilCommand,
  ): Promise<Result<ActualizarPerfilResponse, IdentityError>> {
    const usuario = await this.usuarios.porId(UniqueId.desde(cmd.usuarioId))
    if (!usuario) return Err(new UsuarioNoEncontradoError(cmd.usuarioId))

    const r = usuario.actualizarPerfil(cmd.cambios)
    if (isErr(r)) return Err(r.error)

    await this.usuarios.guardar(usuario)
    await this.publisher.publish(usuario.pullEvents())
    return Ok({ actualizado: true })
  }
}
