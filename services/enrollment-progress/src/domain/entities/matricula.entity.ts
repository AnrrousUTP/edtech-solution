import { AggregateRoot, Err, Ok, type Result, UniqueId } from '@edtech/shared-kernel'
import { CarreraCompletadaEvent } from '../events/carrera-completada.event'
import { CursoCompletadoEvent } from '../events/curso-completado.event'
import { LeccionCompletadaEvent } from '../events/leccion-completada.event'
import { MatriculaCreadaEvent } from '../events/matricula-creada.event'
import { TomoCompletadoEvent } from '../events/tomo-completado.event'
import {
  LeccionFueraDelCursoError,
  MatriculaNoActivaError,
  type EnrollmentError,
} from '../module.errors'
import type { CursoProyectado, TomoProyectado } from '../value-objects/curso-proyectado.vo'

export type EstadoMatricula = 'ACTIVA' | 'REVOCADA' | 'EXPIRADA'
export type OrigenMatricula = 'PAGO' | 'ALTA_MANUAL' | 'GRATUITO'

type Props = {
  id: UniqueId
  usuarioId: UniqueId
  cursoId: UniqueId
  estado: EstadoMatricula
  origen: OrigenMatricula
  ordenId: UniqueId | null
  accesoHasta: Date | null
  /** leccionId → tomoId */
  leccionesCompletadas: Map<string, string>
  tomosCompletados: Set<string>
}

export class Matricula extends AggregateRoot {
  private constructor(private readonly props: Props) {
    super()
  }

  /** La matrícula solo se habilita por PagoConfirmadoEvent, alta manual del
   *  admin o curso gratuito — nunca por una llamada del frontend a secas
   *  (invariante, doc 02 §5.3). */
  static habilitarPorPago(usuarioId: UniqueId, cursoId: UniqueId, ordenId: UniqueId): Matricula {
    return Matricula.#crear(usuarioId, cursoId, 'PAGO', ordenId)
  }

  static altaManual(usuarioId: UniqueId, cursoId: UniqueId): Matricula {
    return Matricula.#crear(usuarioId, cursoId, 'ALTA_MANUAL', null)
  }

  static gratuita(usuarioId: UniqueId, cursoId: UniqueId): Matricula {
    return Matricula.#crear(usuarioId, cursoId, 'GRATUITO', null)
  }

  static #crear(
    usuarioId: UniqueId,
    cursoId: UniqueId,
    origen: OrigenMatricula,
    ordenId: UniqueId | null,
  ): Matricula {
    const m = new Matricula({
      id: UniqueId.nuevo(),
      usuarioId,
      cursoId,
      estado: 'ACTIVA',
      origen,
      ordenId,
      accesoHasta: null,
      leccionesCompletadas: new Map(),
      tomosCompletados: new Set(),
    })
    m.record(
      new MatriculaCreadaEvent(
        m.props.id.valor,
        usuarioId.valor,
        cursoId.valor,
        origen,
        ordenId?.valor ?? null,
      ),
    )
    return m
  }

  static reconstruir(props: Props): Matricula {
    return new Matricula(props)
  }

  completarLeccion(
    leccionId: string,
    tomo: TomoProyectado,
    ahora: Date,
  ): Result<void, EnrollmentError> {
    if (this.props.estado !== 'ACTIVA') return Err(new MatriculaNoActivaError(this.props.id.valor))
    if (this.props.leccionesCompletadas.has(leccionId)) return Ok(undefined) // idempotente
    if (!tomo.leccionIds.includes(leccionId)) return Err(new LeccionFueraDelCursoError(leccionId))

    this.props.leccionesCompletadas.set(leccionId, tomo.id)
    this.record(
      new LeccionCompletadaEvent(
        this.props.id.valor,
        this.props.usuarioId.valor,
        this.props.cursoId.valor,
        tomo.id,
        leccionId,
        ahora,
      ),
    )
    return Ok(undefined)
  }

  /** Un tomo se completa SOLO si todas sus lecciones están hechas y la
   *  evaluación aprobada (doc 02 §1). Idempotente. */
  intentarCompletarTomo(
    tomo: TomoProyectado,
    evaluacionAprobada: boolean,
    puntaje: number,
  ): boolean {
    if (this.props.tomosCompletados.has(tomo.id)) return false
    if (this.props.estado !== 'ACTIVA') return false
    if (!evaluacionAprobada) return false
    if (!tomo.leccionIds.every(l => this.props.leccionesCompletadas.has(l))) return false

    this.props.tomosCompletados.add(tomo.id)
    this.record(
      new TomoCompletadoEvent(
        this.props.id.valor,
        this.props.usuarioId.valor,
        this.props.cursoId.valor,
        tomo.id,
        puntaje,
      ),
    )
    return true
  }

  /** El curso se completa cuando todos sus tomos están completados (doc 02 §1). */
  intentarCompletarCurso(curso: CursoProyectado, ahora: Date): boolean {
    if (curso.tomos.length === 0) return false
    if (!curso.tomos.every(t => this.props.tomosCompletados.has(t.id))) return false

    this.record(
      new CursoCompletadoEvent(
        this.props.id.valor,
        this.props.usuarioId.valor,
        this.props.cursoId.valor,
        curso.titulo,
        ahora,
        curso.nivelMax,
      ),
    )
    return true
  }

  registrarCarreraCompletada(carreraId: string, carreraTitulo: string): void {
    this.record(new CarreraCompletadaEvent(this.props.usuarioId.valor, carreraId, carreraTitulo))
  }

  revocar(): void {
    if (this.props.estado === 'REVOCADA') return
    this.props.estado = 'REVOCADA'
  }

  get id(): UniqueId {
    return this.props.id
  }
  get usuarioId(): UniqueId {
    return this.props.usuarioId
  }
  get cursoId(): UniqueId {
    return this.props.cursoId
  }
  get estado(): EstadoMatricula {
    return this.props.estado
  }
  get origen(): OrigenMatricula {
    return this.props.origen
  }
  get ordenId(): UniqueId | null {
    return this.props.ordenId
  }
  get accesoHasta(): Date | null {
    return this.props.accesoHasta
  }
  get leccionesCompletadas(): ReadonlyMap<string, string> {
    return this.props.leccionesCompletadas
  }
  get tomosCompletados(): ReadonlySet<string> {
    return this.props.tomosCompletados
  }
}
