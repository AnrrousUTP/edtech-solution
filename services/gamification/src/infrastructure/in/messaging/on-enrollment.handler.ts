import type { Command, SobreEvento } from '@edtech/shared-kernel'
import type {
  OtorgarPorCarreraCommand,
  OtorgarPorCursoCommand,
} from '../../../application/otorgar-por-curso/otorgar-por-curso.handler'
import type {
  CrearPerfilCommand,
  OtorgarEvaluacionPerfectaCommand,
  RegistrarActividadCommand,
} from '../../../application/registrar-actividad/registrar-actividad.handler'
import type { GenerarPdfCommand } from '../../../application/generar-pdf/generar-pdf.handler'

/** enrollment.curso-completado.v1 → insignia + certificado menor. */
export const onCursoCompletado = (sobre: SobreEvento): Command => {
  const p = sobre.payload
  const cmd: OtorgarPorCursoCommand = {
    _tag: 'OtorgarPorCurso',
    usuarioId: String(p.usuarioId),
    cursoId: String(p.cursoId),
    cursoTitulo: String(p.cursoTitulo),
  }
  return cmd
}

/** enrollment.carrera-completada.v1 → certificado mayor. */
export const onCarreraCompletada = (sobre: SobreEvento): Command => {
  const p = sobre.payload
  const cmd: OtorgarPorCarreraCommand = {
    _tag: 'OtorgarPorCarrera',
    usuarioId: String(p.usuarioId),
    carreraId: String(p.carreraId),
    carreraTitulo: String(p.carreraTitulo),
  }
  return cmd
}

/** enrollment.leccion-completada.v1 → racha y puntos. */
export const onLeccionCompletada = (sobre: SobreEvento): Command => {
  const cmd: RegistrarActividadCommand = {
    _tag: 'RegistrarActividad',
    usuarioId: String(sobre.payload.usuarioId),
    puntos: 10,
  }
  return cmd
}

/** enrollment.tomo-completado.v1 → puntos (la insignia es del curso). */
export const onTomoCompletado = (sobre: SobreEvento): Command => {
  const cmd: RegistrarActividadCommand = {
    _tag: 'RegistrarActividad',
    usuarioId: String(sobre.payload.usuarioId),
    puntos: 30,
  }
  return cmd
}

/** enrollment.evaluacion-aprobada.v1 → insignia EVALUACION_PERFECTA si 100%. */
export const onEvaluacionAprobada = (sobre: SobreEvento): Command | null => {
  const p = sobre.payload
  if (p.perfecto !== true) return null
  const cmd: OtorgarEvaluacionPerfectaCommand = {
    _tag: 'OtorgarEvaluacionPerfecta',
    usuarioId: String(p.usuarioId),
    tomoId: String(p.tomoId),
  }
  return cmd
}

/** identity.usuario-registrado.v1 → crea el perfil de gamificación. */
export const onUsuarioRegistrado = (sobre: SobreEvento): Command => {
  const cmd: CrearPerfilCommand = {
    _tag: 'CrearPerfil',
    usuarioId: String(sobre.payload.usuarioId),
  }
  return cmd
}

/** Cola INTERNA de certificados (no viaja por el bus). */
export const onGenerarPdf = (sobre: SobreEvento): Command => {
  const cmd: GenerarPdfCommand = {
    _tag: 'GenerarPdf',
    certificadoId: String(sobre.payload.certificadoId),
  }
  return cmd
}
