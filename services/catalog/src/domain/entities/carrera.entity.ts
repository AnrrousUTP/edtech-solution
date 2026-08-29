import { AggregateRoot, Err, Ok, type Result, UniqueId } from '@edtech/shared-kernel'
import { OrdenNoContiguoError, type CatalogError } from '../module.errors'
import type { Slug } from '../value-objects/slug.vo'

export type EstadoPub = 'BORRADOR' | 'PUBLICADO' | 'DESPUBLICADO'
export type CursoEnCarrera = { cursoId: string; orden: number }

type Props = {
  id: UniqueId
  slug: Slug
  titulo: string
  descripcion: string
  imagenUrl: string | null
  estado: EstadoPub
  cursos: CursoEnCarrera[]
}

export class Carrera extends AggregateRoot {
  private constructor(private readonly props: Props) {
    super()
  }

  static crear(datos: {
    slug: Slug
    titulo: string
    descripcion: string
    imagenUrl?: string | null
  }): Carrera {
    return new Carrera({
      id: UniqueId.nuevo(),
      slug: datos.slug,
      titulo: datos.titulo,
      descripcion: datos.descripcion,
      imagenUrl: datos.imagenUrl ?? null,
      estado: 'BORRADOR',
      cursos: [],
    })
  }

  static reconstruir(props: Props): Carrera {
    return new Carrera(props)
  }

  /** Una carrera es un ordenamiento de cursos con prerrequisitos (doc 02 §1). */
  reemplazarCursos(cursos: CursoEnCarrera[]): Result<void, CatalogError> {
    const ordenados = cursos.map(c => c.orden).sort((a, b) => a - b)
    for (let i = 0; i < ordenados.length; i++) {
      if (ordenados[i] !== i + 1) return Err(new OrdenNoContiguoError('cursos de la carrera'))
    }
    this.props.cursos = cursos
    return Ok(undefined)
  }

  publicar(): void {
    this.props.estado = 'PUBLICADO'
  }

  get id(): UniqueId {
    return this.props.id
  }
  get slug(): Slug {
    return this.props.slug
  }
  get titulo(): string {
    return this.props.titulo
  }
  get descripcion(): string {
    return this.props.descripcion
  }
  get imagenUrl(): string | null {
    return this.props.imagenUrl
  }
  get estado(): EstadoPub {
    return this.props.estado
  }
  get cursos(): readonly CursoEnCarrera[] {
    return this.props.cursos
  }
}
