import { Ok, type Command, type CommandHandler, type Result } from '@edtech/shared-kernel'
import type { EnrollmentError } from '../../domain/module.errors'
import type { CursoProyeccionRepository } from '../../domain/ports-out/curso-proyeccion.repository'

export type ProyectarCursoCommand = Command & {
  readonly _tag: 'ProyectarCurso'
  readonly cursoId: string
  readonly titulo: string
  readonly slug: string
  readonly precio: number
  readonly nivelMax: string | null
  readonly estructura: unknown
}

/** Mantiene la proyección local del catálogo (D14): es un read model, se
 *  reconstruye entero reprocesando eventos y nunca es fuente de verdad. */
export class ProyectarCursoHandler implements CommandHandler<
  ProyectarCursoCommand,
  { ok: true },
  EnrollmentError
> {
  readonly handles = 'ProyectarCurso' as const

  constructor(private readonly proyeccion: CursoProyeccionRepository) {}

  async execute(cmd: ProyectarCursoCommand): Promise<Result<{ ok: true }, EnrollmentError>> {
    await this.proyeccion.guardar({
      cursoId: cmd.cursoId,
      titulo: cmd.titulo,
      slug: cmd.slug,
      publicado: true,
      precio: cmd.precio,
      nivelMax: cmd.nivelMax,
      estructura: cmd.estructura,
    })
    return Ok({ ok: true })
  }
}

export type DespublicarProyeccionCommand = Command & {
  readonly _tag: 'DespublicarProyeccion'
  readonly cursoId: string
}

/** Despublicar NO revoca acceso ya comprado: solo impide matrículas nuevas
 *  (doc 02 §5.3). */
export class DespublicarProyeccionHandler implements CommandHandler<
  DespublicarProyeccionCommand,
  { ok: true },
  EnrollmentError
> {
  readonly handles = 'DespublicarProyeccion' as const

  constructor(private readonly proyeccion: CursoProyeccionRepository) {}

  async execute(cmd: DespublicarProyeccionCommand): Promise<Result<{ ok: true }, EnrollmentError>> {
    await this.proyeccion.marcarPublicado(cmd.cursoId, false)
    return Ok({ ok: true })
  }
}

export type ActualizarTomoProyeccionCommand = Command & {
  readonly _tag: 'ActualizarTomoProyeccion'
  readonly cursoId: string
  readonly tomoId: string
  readonly lecciones: { id: string; titulo: string }[]
}

export class ActualizarTomoProyeccionHandler implements CommandHandler<
  ActualizarTomoProyeccionCommand,
  { ok: true },
  EnrollmentError
> {
  readonly handles = 'ActualizarTomoProyeccion' as const

  constructor(private readonly proyeccion: CursoProyeccionRepository) {}

  async execute(
    cmd: ActualizarTomoProyeccionCommand,
  ): Promise<Result<{ ok: true }, EnrollmentError>> {
    await this.proyeccion.actualizarTomo(cmd.cursoId, cmd.tomoId, cmd.lecciones)
    return Ok({ ok: true })
  }
}
