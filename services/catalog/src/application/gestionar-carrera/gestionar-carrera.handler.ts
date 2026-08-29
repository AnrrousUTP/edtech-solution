import {
  Err,
  Ok,
  UniqueId,
  isErr,
  type Command,
  type CommandHandler,
  type Result,
} from '@edtech/shared-kernel'
import { Carrera } from '../../domain/entities/carrera.entity'
import { CarreraNoEncontradaError, type CatalogError } from '../../domain/module.errors'
import type { CarreraRepository } from '../../domain/ports-out/carrera.repository'
import { Slug } from '../../domain/value-objects/slug.vo'

export type GestionarCarreraCommand = Command & {
  readonly _tag: 'GestionarCarrera'
  readonly carreraId?: string
  readonly slug?: string
  readonly titulo?: string
  readonly descripcion?: string
  readonly imagenUrl?: string
  readonly cursos?: { cursoId: string; orden: number }[]
  readonly publicar?: boolean
}

export type GestionarCarreraResponse = { carreraId: string }

export class GestionarCarreraHandler implements CommandHandler<
  GestionarCarreraCommand,
  GestionarCarreraResponse,
  CatalogError
> {
  readonly handles = 'GestionarCarrera' as const

  constructor(private readonly carreras: CarreraRepository) {}

  async execute(
    cmd: GestionarCarreraCommand,
  ): Promise<Result<GestionarCarreraResponse, CatalogError>> {
    let carrera: Carrera
    if (cmd.carreraId) {
      const existente = await this.carreras.porId(UniqueId.desde(cmd.carreraId))
      if (!existente) return Err(new CarreraNoEncontradaError(cmd.carreraId))
      carrera = existente
    } else {
      const slug = Slug.crear(cmd.slug ?? '')
      if (isErr(slug)) return Err(slug.error)
      carrera = Carrera.crear({
        slug: slug.value,
        titulo: cmd.titulo ?? '',
        descripcion: cmd.descripcion ?? '',
        imagenUrl: cmd.imagenUrl ?? null,
      })
    }

    if (cmd.cursos) {
      const r = carrera.reemplazarCursos(cmd.cursos)
      if (isErr(r)) return Err(r.error)
    }
    if (cmd.publicar) carrera.publicar()

    await this.carreras.guardar(carrera)
    return Ok({ carreraId: carrera.id.valor })
  }
}
