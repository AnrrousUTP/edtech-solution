import {
  Err,
  Ok,
  isErr,
  type Command,
  type CommandHandler,
  type Result,
} from '@edtech/shared-kernel'
import { Curso } from '../../domain/entities/curso.entity'
import { SlugDuplicadoError, type CatalogError } from '../../domain/module.errors'
import type { CursoRepository } from '../../domain/ports-out/curso.repository'
import { Dinero } from '../../domain/value-objects/dinero.vo'
import { Nivel } from '../../domain/value-objects/nivel.vo'
import { Slug } from '../../domain/value-objects/slug.vo'

export type CrearCursoCommand = Command & {
  readonly _tag: 'CrearCurso'
  readonly slug: string
  readonly titulo: string
  readonly descripcion: string
  readonly tecnologia: string
  readonly nivelMin: string
  readonly nivelMax: string
  readonly precio: number
  readonly moneda: string
  readonly imagenUrl?: string
}

export type CrearCursoResponse = { cursoId: string }

export class CrearCursoHandler implements CommandHandler<
  CrearCursoCommand,
  CrearCursoResponse,
  CatalogError
> {
  readonly handles = 'CrearCurso' as const

  constructor(private readonly cursos: CursoRepository) {}

  async execute(cmd: CrearCursoCommand): Promise<Result<CrearCursoResponse, CatalogError>> {
    const slug = Slug.crear(cmd.slug)
    if (isErr(slug)) return Err(slug.error)
    const nivelMin = Nivel.crear(cmd.nivelMin)
    if (isErr(nivelMin)) return Err(nivelMin.error)
    const nivelMax = Nivel.crear(cmd.nivelMax)
    if (isErr(nivelMax)) return Err(nivelMax.error)
    const precio = Dinero.crear(cmd.precio, cmd.moneda)
    if (isErr(precio)) return Err(precio.error)

    const existente = await this.cursos.porSlug(slug.value.valor)
    if (existente) return Err(new SlugDuplicadoError(slug.value.valor))

    const curso = Curso.crear({
      slug: slug.value,
      titulo: cmd.titulo,
      descripcion: cmd.descripcion,
      tecnologia: cmd.tecnologia,
      nivelMin: nivelMin.value,
      nivelMax: nivelMax.value,
      precio: precio.value,
      imagenUrl: cmd.imagenUrl ?? null,
    })
    if (isErr(curso)) return Err(curso.error)

    await this.cursos.guardar(curso.value)
    return Ok({ cursoId: curso.value.id.valor })
  }
}
