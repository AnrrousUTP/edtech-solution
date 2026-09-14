import { z } from 'zod'
import { llamar, llamarOpcional } from '@/lib/api'

export const matriculaResumen = z.object({
  matriculaId: z.string(),
  cursoId: z.string(),
  cursoTitulo: z.string().nullable(),
  estado: z.string(),
  origen: z.string(),
  leccionesCompletadas: z.number(),
  tomosCompletados: z.number(),
  totalTomos: z.number().nullable(),
})

export const progresoCurso = z.object({
  matriculaId: z.string(),
  estado: z.string(),
  tomos: z.array(
    z.object({
      tomoId: z.string(),
      titulo: z.string(),
      orden: z.number(),
      umbral: z.number(),
      completado: z.boolean(),
      lecciones: z.array(z.object({ leccionId: z.string(), completada: z.boolean() })),
    }),
  ),
})

export const resultadoIntento = z.object({
  puntaje: z.number(),
  aprobado: z.boolean(),
  nivelResultante: z.string().nullable(),
  tomoCompletado: z.boolean(),
  cursoCompletado: z.boolean(),
})

export type MatriculaResumen = z.infer<typeof matriculaResumen>
export type ProgresoCurso = z.infer<typeof progresoCurso>
export type ResultadoIntento = z.infer<typeof resultadoIntento>

export const enrollmentApi = {
  misMatriculas: () => llamar('/api/enrollment/mis-matriculas', z.array(matriculaResumen)),

  progreso: (cursoId: string) =>
    llamarOpcional(`/api/enrollment/progreso/${cursoId}`, progresoCurso),

  matricularGratuito: (cursoId: string) =>
    llamar(
      '/api/enrollment/matriculas',
      z.object({ matriculaId: z.string(), creada: z.boolean() }),
      { metodo: 'POST', cuerpo: { cursoId } },
    ),

  matricularManual: (usuarioId: string, cursoId: string) =>
    llamar(
      '/api/enrollment/admin/matriculas',
      z.object({ matriculaId: z.string(), creada: z.boolean() }),
      {
        metodo: 'POST',
        cuerpo: { usuarioId, cursoId },
      },
    ),

  completarLeccion: (leccionId: string, cursoId: string) =>
    llamar(
      `/api/enrollment/lecciones/${leccionId}/completar`,
      z.object({ tomoCompletado: z.boolean(), cursoCompletado: z.boolean() }),
      { metodo: 'POST', cuerpo: { cursoId } },
    ),

  iniciarIntento: (datos: {
    tipo: 'NIVELACION' | 'TOMO' | 'DIAGNOSTICO_PREVIO' | 'REFUERZO'
    bancoId: string
    cursoId?: string
    tomoId?: string
  }) =>
    llamar('/api/enrollment/intentos', z.object({ intentoId: z.string() }), {
      metodo: 'POST',
      cuerpo: datos,
    }),

  entregarIntento: (intentoId: string, respuestas: { preguntaId: string; respuesta: unknown }[]) =>
    llamar(`/api/enrollment/intentos/${intentoId}/entregar`, resultadoIntento, {
      metodo: 'POST',
      cuerpo: { respuestas },
    }),
}
