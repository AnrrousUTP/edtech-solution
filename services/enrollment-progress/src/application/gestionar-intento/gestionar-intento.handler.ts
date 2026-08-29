import {
  Err,
  Ok,
  UniqueId,
  isErr,
  type Command,
  type CommandHandler,
  type IEventPublisher,
  type Reloj,
  type Result,
} from '@edtech/shared-kernel'
import {
  IntentoEvaluacion,
  type TipoEvaluacion,
} from '../../domain/entities/intento-evaluacion.entity'
import {
  CursoNoProyectadoError,
  IntentoAjenoError,
  IntentoNoEncontradoError,
  SinMatriculaError,
  TomoNoEncontradoError,
  type EnrollmentError,
} from '../../domain/module.errors'
import type { BancoRespuestasPort } from '../../domain/ports-out/banco-respuestas.port'
import type { CarrerasPort } from '../../domain/ports-out/carreras.port'
import type { CursoProyeccionRepository } from '../../domain/ports-out/curso-proyeccion.repository'
import type { IntentoRepository } from '../../domain/ports-out/intento.repository'
import type { MatriculaRepository } from '../../domain/ports-out/matricula.repository'
import type { RespuestaDada } from '../../domain/services/correccion.service'
import { intentarCascadaCurso } from '../cascada-progreso'

export type IniciarIntentoCommand = Command & {
  readonly _tag: 'IniciarIntento'
  readonly usuarioId: string
  readonly tipo: TipoEvaluacion
  readonly bancoId: string
  readonly cursoId?: string
  readonly tomoId?: string
}

export type IniciarIntentoResponse = { intentoId: string }

export class IniciarIntentoHandler implements CommandHandler<
  IniciarIntentoCommand,
  IniciarIntentoResponse,
  EnrollmentError
> {
  readonly handles = 'IniciarIntento' as const

  constructor(
    private readonly intentos: IntentoRepository,
    private readonly matriculas: MatriculaRepository,
    private readonly cursos: CursoProyeccionRepository,
    private readonly reloj: Reloj,
  ) {}

  async execute(
    cmd: IniciarIntentoCommand,
  ): Promise<Result<IniciarIntentoResponse, EnrollmentError>> {
    const usuarioId = UniqueId.desde(cmd.usuarioId)
    let matriculaId: UniqueId | null = null

    if (cmd.tipo !== 'NIVELACION') {
      // No hay progreso sin matrícula activa (invariante doc 02 §5.3)
      if (!cmd.cursoId || !cmd.tomoId)
        return Err(new TomoNoEncontradoError(cmd.tomoId ?? 'sin tomo'))
      const matricula = await this.matriculas.porUsuarioYCurso(
        usuarioId,
        UniqueId.desde(cmd.cursoId),
      )
      if (!matricula) return Err(new SinMatriculaError(cmd.usuarioId, cmd.cursoId))
      const curso = await this.cursos.porId(cmd.cursoId)
      if (!curso) return Err(new CursoNoProyectadoError(cmd.cursoId))
      if (!curso.tomoPorId(cmd.tomoId)) return Err(new TomoNoEncontradoError(cmd.tomoId))
      matriculaId = matricula.id
    }

    const intento = IntentoEvaluacion.iniciar({
      usuarioId,
      tipo: cmd.tipo,
      bancoId: UniqueId.desde(cmd.bancoId),
      matriculaId,
      tomoId: cmd.tomoId ?? null,
      ahora: this.reloj.ahora(),
    })
    await this.intentos.guardar(intento)
    return Ok({ intentoId: intento.id.valor })
  }
}

export type EntregarIntentoCommand = Command & {
  readonly _tag: 'EntregarIntento'
  readonly usuarioId: string
  readonly intentoId: string
  readonly respuestas: RespuestaDada[]
}

export type EntregarIntentoResponse = {
  puntaje: number
  aprobado: boolean
  nivelResultante: string | null
  tomoCompletado: boolean
  cursoCompletado: boolean
}

/** Assessment absorbido (D3): la entrega, la corrección (vía A-19) y el avance
 *  de tomo/curso que provoca son la misma transacción de negocio. */
export class EntregarIntentoHandler implements CommandHandler<
  EntregarIntentoCommand,
  EntregarIntentoResponse,
  EnrollmentError
> {
  readonly handles = 'EntregarIntento' as const

  constructor(
    private readonly intentos: IntentoRepository,
    private readonly matriculas: MatriculaRepository,
    private readonly cursos: CursoProyeccionRepository,
    private readonly respuestasPort: BancoRespuestasPort,
    private readonly carreras: CarrerasPort,
    private readonly publisher: IEventPublisher,
    private readonly reloj: Reloj,
  ) {}

  async execute(
    cmd: EntregarIntentoCommand,
  ): Promise<Result<EntregarIntentoResponse, EnrollmentError>> {
    const intento = await this.intentos.porId(UniqueId.desde(cmd.intentoId))
    if (!intento) return Err(new IntentoNoEncontradoError(cmd.intentoId))
    if (intento.usuarioId.valor !== cmd.usuarioId.toLowerCase())
      return Err(new IntentoAjenoError(cmd.intentoId))

    // A-19: si catalog no responde, el intento queda EN_CURSO y se reintenta
    const banco = await this.respuestasPort.respuestasDe(intento.bancoId.valor)
    if (isErr(banco)) return Err(banco.error)

    const umbral = intento.tipo === 'NIVELACION' ? 60 : (banco.value.umbral ?? 70)
    const r = intento.entregar(cmd.respuestas, banco.value.preguntas, umbral, this.reloj.ahora())
    if (isErr(r)) return Err(r.error)

    await this.intentos.guardar(intento)
    await this.publisher.publish(intento.pullEvents())

    // Avance del tomo en la misma operación de negocio
    let tomoCompletado = false
    let cursoCompletado = false
    if (intento.tipo === 'TOMO' && r.value.aprobado && intento.matriculaId && intento.tomoId) {
      const matricula = await this.matriculas.porId(intento.matriculaId)
      const curso = matricula ? await this.cursos.porId(matricula.cursoId.valor) : null
      const tomo = curso?.tomoPorId(intento.tomoId) ?? null
      if (matricula && curso && tomo) {
        tomoCompletado = matricula.intentarCompletarTomo(tomo, true, r.value.porcentaje)
        if (tomoCompletado) {
          const cascada = await intentarCascadaCurso(matricula, curso, {
            matriculas: this.matriculas,
            carreras: this.carreras,
            reloj: this.reloj,
          })
          cursoCompletado = cascada.cursoCompletado
        }
        await this.matriculas.guardar(matricula)
        await this.publisher.publish(matricula.pullEvents())
      }
    }

    return Ok({
      puntaje: r.value.porcentaje,
      aprobado: r.value.aprobado,
      nivelResultante: intento.nivel,
      tomoCompletado,
      cursoCompletado,
    })
  }
}
