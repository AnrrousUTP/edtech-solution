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
import { CursoNoEncontradoError, type CatalogError } from '../../domain/module.errors'
import type { CursoRepository } from '../../domain/ports-out/curso.repository'
import { Dinero } from '../../domain/value-objects/dinero.vo'

export type ActualizarCursoCommand = Command & {
  readonly _tag: 'ActualizarCurso'
  readonly cursoId: string
  readonly titulo?: string
  readonly descripcion?: string
  readonly tecnologia?: string
  readonly imagenUrl?: string | null
  readonly precio?: number
  readonly moneda?: string
}

export type ActualizarCursoResponse = { versionPrecio: number }

export class ActualizarCursoHandler implements CommandHandler<
  ActualizarCursoCommand,
  ActualizarCursoResponse,
  CatalogError
> {
  readonly handles = 'ActualizarCurso' as const

  constructor(
    private readonly cursos: CursoRepository,
    private readonly publisher: IEventPublisher,
  ) {}

  async execute(
    cmd: ActualizarCursoCommand,
  ): Promise<Result<ActualizarCursoResponse, CatalogError>> {
    const curso = await this.cursos.porId(UniqueId.desde(cmd.cursoId))
    if (!curso) return Err(new CursoNoEncontradoError(cmd.cursoId))

    curso.actualizarMetadata({
      ...(cmd.titulo !== undefined ? { titulo: cmd.titulo } : {}),
      ...(cmd.descripcion !== undefined ? { descripcion: cmd.descripcion } : {}),
      ...(cmd.tecnologia !== undefined ? { tecnologia: cmd.tecnologia } : {}),
      ...(cmd.imagenUrl !== undefined ? { imagenUrl: cmd.imagenUrl } : {}),
    })

    if (cmd.precio !== undefined) {
      const precio = Dinero.crear(cmd.precio, cmd.moneda ?? curso.precio.moneda)
      if (isErr(precio)) return Err(precio.error)
      curso.cambiarPrecio(precio.value)
    }

    await this.cursos.guardar(curso)
    await this.publisher.publish(curso.pullEvents())
    return Ok({ versionPrecio: curso.versionPrecio })
  }
}
