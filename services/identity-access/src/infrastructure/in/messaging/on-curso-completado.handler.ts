import type { Command, SobreEvento } from '@edtech/shared-kernel'
import type { SubirNivelPorCursoCommand } from '../../../application/subir-nivel/subir-nivel.handler'

/** Traduce enrollment.curso-completado.v1 → SubirNivelPorCurso. Sin lógica de negocio. */
export const onCursoCompletado = (sobre: SobreEvento): Command => {
  const p = sobre.payload
  const cmd: SubirNivelPorCursoCommand = {
    _tag: 'SubirNivelPorCurso',
    usuarioId: String(p.usuarioId),
    ...(typeof p.nivelMax === 'string' ? { nivelMaxCurso: p.nivelMax } : {}),
  }
  return cmd
}
