import { AggregateRoot, Err, Ok, type Result, UniqueId } from '@edtech/shared-kernel'
import {
  ContenidoActualizadoEvent,
  type LeccionPublicada,
} from '../events/contenido-actualizado.event'
import { CursoDespublicadoEvent } from '../events/curso-despublicado.event'
import { CursoPublicadoEvent, type EstructuraTomo } from '../events/curso-publicado.event'
import { PrecioActualizadoEvent } from '../events/precio-actualizado.event'
import {
  CursoNoPublicableError,
  OrdenNoContiguoError,
  TomoNoEncontradoError,
  type CatalogError,
} from '../module.errors'
import type { Dinero } from '../value-objects/dinero.vo'
import type { Nivel } from '../value-objects/nivel.vo'
import type { Slug } from '../value-objects/slug.vo'

export type EstadoPub = 'BORRADOR' | 'PUBLICADO' | 'DESPUBLICADO'

export type LeccionInfo = {
  id: string
  orden: number
  titulo: string
  duracionMin: number
  contenidoHash: string
}

export type TomoInfo = {
  id: string
  orden: number
  titulo: string
  descripcion: string | null
  umbral: number
  lecciones: LeccionInfo[]
}

type Props = {
  id: UniqueId
  slug: Slug
  titulo: string
  descripcion: string
  tecnologia: string
  nivelMin: Nivel
  nivelMax: Nivel
  precio: Dinero
  versionPrecio: number
  imagenUrl: string | null
  estado: EstadoPub
  publicadoAt: Date | null
  tomos: TomoInfo[]
}

export class Curso extends AggregateRoot {
  private constructor(private readonly props: Props) {
    super()
  }

  static crear(datos: {
    slug: Slug
    titulo: string
    descripcion: string
    tecnologia: string
    nivelMin: Nivel
    nivelMax: Nivel
    precio: Dinero
    imagenUrl?: string | null
  }): Result<Curso, CatalogError> {
    if (datos.nivelMax.indice() < datos.nivelMin.indice())
      return Err(new CursoNoPublicableError('nivelMax no puede ser menor que nivelMin'))
    return Ok(
      new Curso({
        id: UniqueId.nuevo(),
        slug: datos.slug,
        titulo: datos.titulo,
        descripcion: datos.descripcion,
        tecnologia: datos.tecnologia,
        nivelMin: datos.nivelMin,
        nivelMax: datos.nivelMax,
        precio: datos.precio,
        versionPrecio: 1,
        imagenUrl: datos.imagenUrl ?? null,
        estado: 'BORRADOR',
        publicadoAt: null,
        tomos: [],
      }),
    )
  }

  static reconstruir(props: Props): Curso {
    return new Curso(props)
  }

  actualizarMetadata(cambios: {
    titulo?: string
    descripcion?: string
    tecnologia?: string
    imagenUrl?: string | null
  }): void {
    if (cambios.titulo !== undefined) this.props.titulo = cambios.titulo
    if (cambios.descripcion !== undefined) this.props.descripcion = cambios.descripcion
    if (cambios.tecnologia !== undefined) this.props.tecnologia = cambios.tecnologia
    if (cambios.imagenUrl !== undefined) this.props.imagenUrl = cambios.imagenUrl
  }

  /** Un curso publicado no cambia de precio sin dejar rastro de versión (doc 02 §5.2). */
  cambiarPrecio(nuevo: Dinero): void {
    if (this.props.precio.equals(nuevo)) return
    const anterior = this.props.precio
    this.props.precio = nuevo
    if (this.props.estado === 'PUBLICADO') {
      this.props.versionPrecio += 1
      this.record(
        new PrecioActualizadoEvent(this.props.id.valor, {
          montoAnterior: anterior.monto,
          montoNuevo: nuevo.monto,
          moneda: nuevo.moneda,
          versionPrecio: this.props.versionPrecio,
        }),
      )
    }
  }

  /** Reemplaza la estructura de un tomo (lecciones y sus hashes). El contenido de
   *  los bloques vive en persistencia; acá solo la estructura y el hash. */
  reemplazarTomos(tomos: TomoInfo[]): Result<void, CatalogError> {
    const ordenValido = this.#validarOrden(
      tomos.map(t => t.orden),
      'tomos',
    )
    if (!ordenValido.ok) return ordenValido
    for (const tomo of tomos) {
      const r = this.#validarOrden(
        tomo.lecciones.map(l => l.orden),
        `lecciones del tomo ${tomo.titulo}`,
      )
      if (!r.ok) return r
    }
    this.props.tomos = tomos
    return Ok(undefined)
  }

  /** El invariante de publicación (doc 02 §5.2): al menos un tomo con al menos
   *  una lección; orden contiguo. El dominio recibe la hora, no la pide. */
  publicar(ahora: Date): Result<void, CatalogError> {
    if (this.props.estado === 'PUBLICADO') return Ok(undefined) // idempotente
    if (this.props.tomos.length === 0)
      return Err(new CursoNoPublicableError('Un curso no se publica sin al menos un tomo'))
    if (this.props.tomos.some(t => t.lecciones.length === 0))
      return Err(new CursoNoPublicableError('Todo tomo debe tener al menos una lección'))

    this.props.estado = 'PUBLICADO'
    this.props.publicadoAt = ahora
    this.record(
      new CursoPublicadoEvent(this.props.id.valor, {
        slug: this.props.slug.valor,
        titulo: this.props.titulo,
        tecnologia: this.props.tecnologia,
        nivelMin: this.props.nivelMin.valor,
        nivelMax: this.props.nivelMax.valor,
        precio: this.props.precio.monto,
        moneda: this.props.precio.moneda,
        versionPrecio: this.props.versionPrecio,
        estructura: this.estructura(),
      }),
    )
    return Ok(undefined)
  }

  despublicar(motivo: string): void {
    if (this.props.estado !== 'PUBLICADO') return
    this.props.estado = 'DESPUBLICADO'
    this.record(new CursoDespublicadoEvent(this.props.id.valor, motivo))
  }

  /** Registra el evento de contenido para un tomo (el S3 key lo aporta quien
   *  subió el contenido; el evento lo registra la entidad, doc 04 §4). */
  registrarContenidoActualizado(
    tomoId: string,
    contenidoHash: string,
    lecciones: LeccionPublicada[],
  ): Result<void, CatalogError> {
    const tomo = this.props.tomos.find(t => t.id === tomoId)
    if (!tomo) return Err(new TomoNoEncontradoError(tomoId))
    this.record(
      new ContenidoActualizadoEvent(this.props.id.valor, tomoId, contenidoHash, lecciones),
    )
    return Ok(undefined)
  }

  estructura(): EstructuraTomo[] {
    return this.props.tomos
      .slice()
      .sort((a, b) => a.orden - b.orden)
      .map(t => ({
        tomoId: t.id,
        orden: t.orden,
        titulo: t.titulo,
        umbral: t.umbral,
        lecciones: t.lecciones
          .slice()
          .sort((a, b) => a.orden - b.orden)
          .map(l => ({ id: l.id, orden: l.orden, titulo: l.titulo })),
      }))
  }

  #validarOrden(ordenes: number[], donde: string): Result<void, OrdenNoContiguoError> {
    const ordenados = ordenes.slice().sort((a, b) => a - b)
    for (let i = 0; i < ordenados.length; i++) {
      if (ordenados[i] !== i + 1) return Err(new OrdenNoContiguoError(donde))
    }
    return Ok(undefined)
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
  get tecnologia(): string {
    return this.props.tecnologia
  }
  get nivelMin(): Nivel {
    return this.props.nivelMin
  }
  get nivelMax(): Nivel {
    return this.props.nivelMax
  }
  get precio(): Dinero {
    return this.props.precio
  }
  get versionPrecio(): number {
    return this.props.versionPrecio
  }
  get imagenUrl(): string | null {
    return this.props.imagenUrl
  }
  get estado(): EstadoPub {
    return this.props.estado
  }
  get publicadoAt(): Date | null {
    return this.props.publicadoAt
  }
  get tomos(): readonly TomoInfo[] {
    return this.props.tomos
  }
}
