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
import { UsuarioNoEncontradoError, type IdentityError } from '../../domain/module.errors'
import type { UsuarioRepository } from '../../domain/ports-out/usuario.repository'
import { Nivel } from '../../domain/value-objects/nivel.vo'

export type FijarNivelPorTestCommand = Command & {
  readonly _tag: 'FijarNivelPorTest'
  readonly usuarioId: string
  readonly nivelResultante: string
}

export type FijarNivelResponse = { nivel: string }

export class FijarNivelPorTestHandler implements CommandHandler<
  FijarNivelPorTestCommand,
  FijarNivelResponse,
  IdentityError
> {
  readonly handles = 'FijarNivelPorTest' as const

  constructor(
    private readonly usuarios: UsuarioRepository,
    private readonly publisher: IEventPublisher,
  ) {}

  async execute(cmd: FijarNivelPorTestCommand): Promise<Result<FijarNivelResponse, IdentityError>> {
    const usuario = await this.usuarios.porId(UniqueId.desde(cmd.usuarioId))
    if (!usuario) return Err(new UsuarioNoEncontradoError(cmd.usuarioId))

    const nivel = Nivel.crear(cmd.nivelResultante)
    if (isErr(nivel)) return Err(nivel.error)

    usuario.fijarNivelPorTest(nivel.value)
    await this.usuarios.guardar(usuario)
    await this.publisher.publish(usuario.pullEvents())
    return Ok({ nivel: usuario.nivel.valor })
  }
}
