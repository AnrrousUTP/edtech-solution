import { log, type Reloj } from '@edtech/shared-kernel'
import type { Matricula } from '../domain/entities/matricula.entity'
import type { CursoProyectado } from '../domain/value-objects/curso-proyectado.vo'
import type { CarrerasPort } from '../domain/ports-out/carreras.port'
import type { MatriculaRepository } from '../domain/ports-out/matricula.repository'

/** Cascada tras completar un tomo: ¿se completó el curso? ¿y con él, una
 *  carrera? La consulta de carreras es la lectura degradable de A-24: si
 *  falla, el evento de carrera no se emite y se reintenta en el próximo curso. */
export const intentarCascadaCurso = async (
  matricula: Matricula,
  curso: CursoProyectado,
  deps: {
    matriculas: MatriculaRepository
    carreras: CarrerasPort
    reloj: Reloj
  },
): Promise<{ cursoCompletado: boolean }> => {
  const yaCompletado = await deps.matriculas.cursoYaCompletado(matricula.id)
  if (yaCompletado) return { cursoCompletado: false }

  const completado = matricula.intentarCompletarCurso(curso, deps.reloj.ahora())
  if (!completado) return { cursoCompletado: false }

  await deps.matriculas.marcarCursoCompletado(matricula.id, curso.cursoId)

  // ¿Alguna carrera quedó completa? (lectura degradable, A-24)
  const completados = new Set(await deps.matriculas.cursosCompletadosDe(matricula.usuarioId))
  completados.add(curso.cursoId)
  const carreras = await deps.carreras.carrerasPublicadas().catch(err => {
    log.warn('no se pudo consultar carreras; carrera-completada se evaluará después', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  })
  for (const carrera of carreras) {
    if (carrera.cursoIds.length > 0 && carrera.cursoIds.every(id => completados.has(id))) {
      matricula.registrarCarreraCompletada(carrera.carreraId, carrera.titulo)
    }
  }

  return { cursoCompletado: true }
}
