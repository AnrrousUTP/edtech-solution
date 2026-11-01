import type { CursoDetalle } from '@/api/catalog'
import type { ProgresoCurso } from '@/api/enrollment'

export const semanaCompletada = (
  tomo: CursoDetalle['tomos'][number],
  progreso: ProgresoCurso,
): boolean => {
  const avanceSemana = progreso.tomos.find(item => item.tomoId === tomo.id)
  return (
    tomo.lecciones.length > 0 &&
    tomo.lecciones.every(leccion =>
      avanceSemana?.lecciones.find(item => item.leccionId === leccion.id)?.completada,
    )
  )
}
