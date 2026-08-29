import {
  Err,
  Ok,
  UniqueId,
  type Command,
  type CommandHandler,
  type IEventPublisher,
  type Result,
} from '@edtech/shared-kernel'
import { Matricula, type OrigenMatricula } from '../../domain/entities/matricula.entity'
import {
  CursoNoGratuitoError,
  CursoNoProyectadoError,
  CursoNoPublicadoError,
  type EnrollmentError,
} from '../../domain/module.errors'
import type { CursoProyeccionRepository } from '../../domain/ports-out/curso-proyeccion.repository'
import type { MatriculaRepository } from '../../domain/ports-out/matricula.repository'

export type CrearMatriculaCommand = Command & {
  readonly _tag: 'CrearMatricula'
  readonly usuarioId: string
  readonly cursoId: string
  readonly origen: OrigenMatricula
  readonly ordenId?: string
}

export type CrearMatriculaResponse = { matriculaId: string; creada: boolean }

/** Idempotente (I-2): el mismo pago dos veces deja UNA matrícula. GRATUITO exige
 *  curso publicado y precio 0; PAGO crea siempre (el dinero ya se cobró). */
export class CrearMatriculaHandler implements CommandHandler<
  CrearMatriculaCommand,
  CrearMatriculaResponse,
  EnrollmentError
> {
  readonly handles = 'CrearMatricula' as const

  constructor(
    private readonly matriculas: MatriculaRepository,
    private readonly proyeccion: CursoProyeccionRepository,
    private readonly publisher: IEventPublisher,
  ) {}

  async execute(
    cmd: CrearMatriculaCommand,
  ): Promise<Result<CrearMatriculaResponse, EnrollmentError>> {
    const usuarioId = UniqueId.desde(cmd.usuarioId)
    const cursoId = UniqueId.desde(cmd.cursoId)

    const existente = await this.matriculas.porUsuarioYCurso(usuarioId, cursoId)
    if (existente) return Ok({ matriculaId: existente.id.valor, creada: false })

    if (cmd.origen === 'GRATUITO') {
      const curso = await this.proyeccion.porId(cmd.cursoId)
      if (!curso) return Err(new CursoNoProyectadoError(cmd.cursoId))
      if (!curso.publicado) return Err(new CursoNoPublicadoError(cmd.cursoId))
      if (!curso.esGratuito) return Err(new CursoNoGratuitoError(cmd.cursoId))
    }

    const matricula =
      cmd.origen === 'PAGO'
        ? Matricula.habilitarPorPago(usuarioId, cursoId, UniqueId.desde(cmd.ordenId ?? ''))
        : cmd.origen === 'ALTA_MANUAL'
          ? Matricula.altaManual(usuarioId, cursoId)
          : Matricula.gratuita(usuarioId, cursoId)

    await this.matriculas.guardar(matricula)
    await this.publisher.publish(matricula.pullEvents())
    return Ok({ matriculaId: matricula.id.valor, creada: true })
  }
}

export type RevocarMatriculaCommand = Command & {
  readonly _tag: 'RevocarMatricula'
  readonly usuarioId: string
  readonly cursoId: string
}

export class RevocarMatriculaHandler implements CommandHandler<
  RevocarMatriculaCommand,
  { revocada: boolean },
  EnrollmentError
> {
  readonly handles = 'RevocarMatricula' as const

  constructor(private readonly matriculas: MatriculaRepository) {}

  async execute(
    cmd: RevocarMatriculaCommand,
  ): Promise<Result<{ revocada: boolean }, EnrollmentError>> {
    const matricula = await this.matriculas.porUsuarioYCurso(
      UniqueId.desde(cmd.usuarioId),
      UniqueId.desde(cmd.cursoId),
    )
    if (!matricula) return Ok({ revocada: false }) // reembolso sin matrícula: nada que revocar
    matricula.revocar()
    await this.matriculas.guardar(matricula)
    return Ok({ revocada: true })
  }
}
