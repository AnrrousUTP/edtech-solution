import {
  Err,
  Ok,
  UniqueId,
  type Query,
  type QueryHandler,
  type Result,
} from '@edtech/shared-kernel'
import {
  CursoNoProyectadoError,
  SinMatriculaError,
  type EnrollmentError,
} from '../../domain/module.errors'
import type { CursoProyeccionRepository } from '../../domain/ports-out/curso-proyeccion.repository'
import type { MatriculaRepository } from '../../domain/ports-out/matricula.repository'

export type MisMatriculasQuery = Query & {
  readonly _tag: 'MisMatriculas'
  readonly usuarioId: string
}

export type MatriculaResumen = {
  matriculaId: string
  cursoId: string
  cursoTitulo: string | null
  estado: string
  origen: string
  leccionesCompletadas: number
  tomosCompletados: number
  totalTomos: number | null
}

export class MisMatriculasHandler implements QueryHandler<
  MisMatriculasQuery,
  MatriculaResumen[],
  EnrollmentError
> {
  readonly handles = 'MisMatriculas' as const

  constructor(
    private readonly matriculas: MatriculaRepository,
    private readonly cursos: CursoProyeccionRepository,
  ) {}

  async execute(q: MisMatriculasQuery): Promise<Result<MatriculaResumen[], EnrollmentError>> {
    const lista = await this.matriculas.porUsuario(UniqueId.desde(q.usuarioId))
    const resultado: MatriculaResumen[] = []
    for (const m of lista) {
      const curso = await this.cursos.porId(m.cursoId.valor)
      resultado.push({
        matriculaId: m.id.valor,
        cursoId: m.cursoId.valor,
        cursoTitulo: curso?.titulo ?? null,
        estado: m.estado,
        origen: m.origen,
        leccionesCompletadas: m.leccionesCompletadas.size,
        tomosCompletados: m.tomosCompletados.size,
        totalTomos: curso?.tomos.length ?? null,
      })
    }
    return Ok(resultado)
  }
}

export type ProgresoCursoQuery = Query & {
  readonly _tag: 'ProgresoCurso'
  readonly usuarioId: string
  readonly cursoId: string
}

export type ProgresoCursoResponse = {
  matriculaId: string
  estado: string
  tomos: {
    tomoId: string
    titulo: string
    orden: number
    umbral: number
    completado: boolean
    lecciones: { leccionId: string; completada: boolean }[]
  }[]
}

export class ProgresoCursoHandler implements QueryHandler<
  ProgresoCursoQuery,
  ProgresoCursoResponse,
  EnrollmentError
> {
  readonly handles = 'ProgresoCurso' as const

  constructor(
    private readonly matriculas: MatriculaRepository,
    private readonly cursos: CursoProyeccionRepository,
  ) {}

  async execute(q: ProgresoCursoQuery): Promise<Result<ProgresoCursoResponse, EnrollmentError>> {
    const matricula = await this.matriculas.porUsuarioYCurso(
      UniqueId.desde(q.usuarioId),
      UniqueId.desde(q.cursoId),
    )
    if (!matricula) return Err(new SinMatriculaError(q.usuarioId, q.cursoId))
    const curso = await this.cursos.porId(q.cursoId)
    if (!curso) return Err(new CursoNoProyectadoError(q.cursoId))

    return Ok({
      matriculaId: matricula.id.valor,
      estado: matricula.estado,
      tomos: curso.tomos.map(t => ({
        tomoId: t.id,
        titulo: t.titulo,
        orden: t.orden,
        umbral: t.umbral,
        completado: matricula.tomosCompletados.has(t.id),
        lecciones: t.leccionIds.map(l => ({
          leccionId: l,
          completada: matricula.leccionesCompletadas.has(l),
        })),
      })),
    })
  }
}
