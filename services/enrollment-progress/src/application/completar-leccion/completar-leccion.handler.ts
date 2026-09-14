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
  CursoNoProyectadoError,
  LeccionBloqueadaError,
  LeccionFueraDelCursoError,
  SinMatriculaError,
  type EnrollmentError,
} from '../../domain/module.errors'
import type { CarrerasPort } from '../../domain/ports-out/carreras.port'
import type { CursoProyeccionRepository } from '../../domain/ports-out/curso-proyeccion.repository'
import type { MatriculaRepository } from '../../domain/ports-out/matricula.repository'
import { intentarCascadaCurso } from '../cascada-progreso'

export type CompletarLeccionCommand = Command & {
  readonly _tag: 'CompletarLeccion'
  readonly usuarioId: string
  readonly cursoId: string
  readonly leccionId: string
}

export type CompletarLeccionResponse = {
  tomoCompletado: boolean
  cursoCompletado: boolean
}

/** El caso de uso completo del doc 04 §6: persistir → pullEvents → publicar. */
export class CompletarLeccionHandler implements CommandHandler<
  CompletarLeccionCommand,
  CompletarLeccionResponse,
  EnrollmentError
> {
  readonly handles = 'CompletarLeccion' as const

  constructor(
    private readonly matriculas: MatriculaRepository,
    private readonly cursos: CursoProyeccionRepository,
    private readonly carreras: CarrerasPort,
    private readonly publisher: IEventPublisher,
    private readonly reloj: Reloj,
  ) {}

  async execute(
    cmd: CompletarLeccionCommand,
  ): Promise<Result<CompletarLeccionResponse, EnrollmentError>> {
    const usuarioId = UniqueId.desde(cmd.usuarioId)
    const cursoId = UniqueId.desde(cmd.cursoId)

    const matricula = await this.matriculas.porUsuarioYCurso(usuarioId, cursoId)
    if (!matricula) return Err(new SinMatriculaError(cmd.usuarioId, cmd.cursoId))

    const curso = await this.cursos.porId(cmd.cursoId)
    if (!curso) return Err(new CursoNoProyectadoError(cmd.cursoId))

    const tomo = curso.tomoDeLeccion(cmd.leccionId)
    if (!tomo) return Err(new LeccionFueraDelCursoError(cmd.leccionId))
    const lecciones = curso.tomos.flatMap(item => item.leccionIds)
    const indice = lecciones.indexOf(cmd.leccionId)
    if (indice > 0 && !matricula.leccionesCompletadas.has(lecciones[indice - 1]!)) {
      return Err(new LeccionBloqueadaError(cmd.leccionId))
    }

    const r = matricula.completarLeccion(cmd.leccionId, tomo, this.reloj.ahora())
    if (isErr(r)) return Err(r.error)

    const evaluacion = await this.matriculas.evaluacionAprobada(usuarioId, tomo.id)
    const tomoCompletado = matricula.intentarCompletarTomo(
      tomo,
      evaluacion.aprobada,
      evaluacion.puntaje,
    )

    let cursoCompletado = false
    if (tomoCompletado) {
      const cascada = await intentarCascadaCurso(matricula, curso, {
        matriculas: this.matriculas,
        carreras: this.carreras,
        reloj: this.reloj,
      })
      cursoCompletado = cascada.cursoCompletado
    }

    await this.matriculas.guardar(matricula) // 1. persistir
    const eventos = matricula.pullEvents() // 2. extraer
    await this.publisher.publish(eventos) // 3. publicar

    return Ok({ tomoCompletado, cursoCompletado })
  }
}
