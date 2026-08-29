import { AggregateRoot, Err, Ok, type Result, UniqueId } from '@edtech/shared-kernel'
import { GeneracionFallidaEvent } from '../events/generacion-fallida.event'
import { MazoGeneradoEvent } from '../events/mazo-generado.event'
import { MazoPublicadoEvent } from '../events/mazo-publicado.event'
import {
  MazoNoRevisableError,
  MotivoRequeridoError,
  TarjetaNoEncontradaError,
  type FlashcardsError,
} from '../module.errors'

export type EstadoMazo = 'GENERANDO' | 'EN_REVISION' | 'PUBLICADO' | 'FALLIDO'
export type EstadoTarjeta = 'PENDIENTE_REVISION' | 'PUBLICADA' | 'RECHAZADA'

export type Tarjeta = {
  id: string
  orden: number
  anverso: string
  reverso: string
  estado: EstadoTarjeta
  revisadaPor: string | null
  revisadaAt: Date | null
  motivoRechazo: string | null
  editada: boolean
}

/** Referencia al contenido fuente: la clave S3 que trajo el evento. El mazo
 *  guarda la referencia, nunca el contenido (doc 02 §7.3). */
export type LeccionFuente = { id: string; titulo: string; bloquesS3Key: string }

type Props = {
  id: UniqueId
  tomoId: string
  cursoId: string
  version: number
  contenidoHash: string
  estado: EstadoMazo
  modeloUsado: string | null
  generadoAt: Date | null
  publicadoAt: Date | null
  intentos: number
  leccionesFuente: LeccionFuente[]
  tarjetas: Tarjeta[]
}

const MAX_INTENTOS = 3 // doc 10 §7: al cuarto, generacion-fallida y se detiene

export class MazoFlashcards extends AggregateRoot {
  private constructor(private readonly props: Props) {
    super()
  }

  static crear(datos: {
    tomoId: string
    cursoId: string
    contenidoHash: string
    version: number
    leccionesFuente: LeccionFuente[]
  }): MazoFlashcards {
    return new MazoFlashcards({
      id: UniqueId.nuevo(),
      tomoId: datos.tomoId,
      cursoId: datos.cursoId,
      version: datos.version,
      contenidoHash: datos.contenidoHash,
      estado: 'GENERANDO',
      modeloUsado: null,
      generadoAt: null,
      publicadoAt: null,
      intentos: 0,
      leccionesFuente: datos.leccionesFuente,
      tarjetas: [],
    })
  }

  static reconstruir(props: Props): MazoFlashcards {
    return new MazoFlashcards(props)
  }

  registrarIntento(): void {
    this.props.intentos += 1
  }

  get agotoIntentos(): boolean {
    return this.props.intentos >= MAX_INTENTOS
  }

  /** Las tarjetas nacen en PENDIENTE_REVISION: HITL sin excepción (doc 10 §6). */
  recibirTarjetas(
    tarjetas: { anverso: string; reverso: string }[],
    modeloUsado: string,
    ahora: Date,
    nuevoId: () => string,
  ): void {
    this.props.tarjetas = tarjetas.map((t, i) => ({
      id: nuevoId(),
      orden: i + 1,
      anverso: t.anverso,
      reverso: t.reverso,
      estado: 'PENDIENTE_REVISION' as const,
      revisadaPor: null,
      revisadaAt: null,
      motivoRechazo: null,
      editada: false,
    }))
    this.props.estado = 'EN_REVISION'
    this.props.modeloUsado = modeloUsado
    this.props.generadoAt = ahora
    this.record(
      new MazoGeneradoEvent(
        this.props.id.valor,
        this.props.tomoId,
        this.props.cursoId,
        this.props.version,
        this.props.tarjetas.length,
        modeloUsado,
      ),
    )
  }

  marcarFallido(motivo: string): void {
    this.props.estado = 'FALLIDO'
    this.record(new GeneracionFallidaEvent(this.props.tomoId, motivo, this.props.intentos))
  }

  aprobarTarjeta(
    tarjetaId: string,
    revisorId: string,
    ahora: Date,
    textoEditado?: { anverso: string; reverso: string },
  ): Result<void, FlashcardsError> {
    if (this.props.estado !== 'EN_REVISION' && this.props.estado !== 'PUBLICADO')
      return Err(new MazoNoRevisableError(this.props.estado))
    const tarjeta = this.props.tarjetas.find(t => t.id === tarjetaId)
    if (!tarjeta) return Err(new TarjetaNoEncontradaError(tarjetaId))

    if (textoEditado) {
      tarjeta.anverso = textoEditado.anverso
      tarjeta.reverso = textoEditado.reverso
      tarjeta.editada = true // responde "¿cuán bueno es el modelo?" con datos (doc 10 §6)
    }
    tarjeta.estado = 'PUBLICADA'
    tarjeta.revisadaPor = revisorId
    tarjeta.revisadaAt = ahora
    tarjeta.motivoRechazo = null

    this.#publicarSiCorresponde(ahora)
    return Ok(undefined)
  }

  /** Rechazar exige un motivo: es lo que permite mejorar el prompt (doc 10 §6). */
  rechazarTarjeta(
    tarjetaId: string,
    revisorId: string,
    motivo: string,
    ahora: Date,
  ): Result<void, FlashcardsError> {
    if (this.props.estado !== 'EN_REVISION' && this.props.estado !== 'PUBLICADO')
      return Err(new MazoNoRevisableError(this.props.estado))
    if (!motivo.trim()) return Err(new MotivoRequeridoError())
    const tarjeta = this.props.tarjetas.find(t => t.id === tarjetaId)
    if (!tarjeta) return Err(new TarjetaNoEncontradaError(tarjetaId))

    tarjeta.estado = 'RECHAZADA'
    tarjeta.revisadaPor = revisorId
    tarjeta.revisadaAt = ahora
    tarjeta.motivoRechazo = motivo.trim()
    return Ok(undefined)
  }

  /** Al aprobar al menos una tarjeta, el mazo pasa a PUBLICADO (doc 10 §1). */
  #publicarSiCorresponde(ahora: Date): void {
    const publicadas = this.props.tarjetas.filter(t => t.estado === 'PUBLICADA').length
    if (publicadas === 0 || this.props.estado === 'PUBLICADO') return
    this.props.estado = 'PUBLICADO'
    this.props.publicadoAt = ahora
    this.record(
      new MazoPublicadoEvent(
        this.props.id.valor,
        this.props.tomoId,
        this.props.cursoId,
        this.props.version,
        publicadas,
      ),
    )
  }

  get id(): UniqueId {
    return this.props.id
  }
  get tomoId(): string {
    return this.props.tomoId
  }
  get cursoId(): string {
    return this.props.cursoId
  }
  get version(): number {
    return this.props.version
  }
  get contenidoHash(): string {
    return this.props.contenidoHash
  }
  get estado(): EstadoMazo {
    return this.props.estado
  }
  get modeloUsado(): string | null {
    return this.props.modeloUsado
  }
  get generadoAt(): Date | null {
    return this.props.generadoAt
  }
  get publicadoAt(): Date | null {
    return this.props.publicadoAt
  }
  get intentos(): number {
    return this.props.intentos
  }
  get leccionesFuente(): readonly LeccionFuente[] {
    return this.props.leccionesFuente
  }
  get tarjetas(): readonly Tarjeta[] {
    return this.props.tarjetas
  }
}
