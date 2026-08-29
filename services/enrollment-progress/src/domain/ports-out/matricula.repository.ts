import type { UniqueId } from '@edtech/shared-kernel'
import type { Matricula } from '../entities/matricula.entity'

export interface MatriculaRepository {
  porId(id: UniqueId): Promise<Matricula | null>
  porUsuarioYCurso(usuarioId: UniqueId, cursoId: UniqueId): Promise<Matricula | null>
  porUsuario(usuarioId: UniqueId): Promise<Matricula[]>
  guardar(matricula: Matricula): Promise<void>
  /** ¿La evaluación del tomo está aprobada para esta matrícula? */
  evaluacionAprobada(
    usuarioId: UniqueId,
    tomoId: string,
  ): Promise<{ aprobada: boolean; puntaje: number }>
  /** cursoIds con curso completado por el usuario (para carrera-completada, A-24). */
  cursosCompletadosDe(usuarioId: UniqueId): Promise<string[]>
  marcarCursoCompletado(matriculaId: UniqueId, cursoId: string): Promise<void>
  cursoYaCompletado(matriculaId: UniqueId): Promise<boolean>
}
