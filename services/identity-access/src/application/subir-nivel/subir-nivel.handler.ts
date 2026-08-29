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

export type SubirNivelPorCursoCommand = Command & {
  readonly _tag: 'SubirNivelPorCurso'
  readonly usuarioId: string
  /** nivelMax del curso completado; opcional en el evento (A-11) */
  readonly nivelMaxCurso?: string
}

export type SubirNivelResponse = { nivel: string }

export class SubirNivelPorCursoHandler implements CommandHandler<
  SubirNivelPorCursoCommand,
  SubirNivelResponse,
  IdentityError
> {
  readonly handles = 'SubirNivelPorCurso' as const

  constructor(
    private readonly usuarios: UsuarioRepository,
    private readonly publisher: IEventPublisher,
  ) {}

  async execute(
    cmd: SubirNivelPorCursoCommand,
  ): Promise<Result<SubirNivelResponse, IdentityError>> {
    const usuario = await this.usuarios.porId(UniqueId.desde(cmd.usuarioId))
    if (!usuario) return Err(new UsuarioNoEncontradoError(cmd.usuarioId))

    if (cmd.nivelMaxCurso !== undefined) {
      const nivel = Nivel.crear(cmd.nivelMaxCurso)
      if (isErr(nivel)) return Err(nivel.error)
      usuario.subirNivelPorCurso(nivel.value)
      await this.usuarios.guardar(usuario)
      await this.publisher.publish(usuario.pullEvents())
    }
    return Ok({ nivel: usuario.nivel.valor })
  }
}
