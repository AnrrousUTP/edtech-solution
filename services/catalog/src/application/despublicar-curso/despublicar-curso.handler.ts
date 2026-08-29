import {
  Err,
  Ok,
  UniqueId,
  type Command,
  type CommandHandler,
  type IEventPublisher,
  type Result,
} from '@edtech/shared-kernel'
import { CursoNoEncontradoError, type CatalogError } from '../../domain/module.errors'
import type { CursoRepository } from '../../domain/ports-out/curso.repository'

export type DespublicarCursoCommand = Command & {
  readonly _tag: 'DespublicarCurso'
  readonly cursoId: string
  readonly motivo: string
}

export class DespublicarCursoHandler implements CommandHandler<
  DespublicarCursoCommand,
  { estado: string },
  CatalogError
> {
  readonly handles = 'DespublicarCurso' as const

  constructor(
    private readonly cursos: CursoRepository,
    private readonly publisher: IEventPublisher,
  ) {}

  async execute(cmd: DespublicarCursoCommand): Promise<Result<{ estado: string }, CatalogError>> {
    const curso = await this.cursos.porId(UniqueId.desde(cmd.cursoId))
    if (!curso) return Err(new CursoNoEncontradoError(cmd.cursoId))

    curso.despublicar(cmd.motivo || 'sin motivo')
    await this.cursos.guardar(curso)
    await this.publisher.publish(curso.pullEvents())
    return Ok({ estado: curso.estado })
  }
}
