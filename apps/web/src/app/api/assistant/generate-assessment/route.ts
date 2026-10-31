import { NextResponse } from 'next/server'
import { z } from 'zod'
import { catalogApi } from '@/api/catalog'
import { AssistantProviderError, generarPreguntasEvaluacion } from '@/lib/assistant/bedrock'
import { reserveAssistantChatQuota } from '@/lib/assistant/quota'
import { docenteHabilitado } from '@/lib/sesion'

export const runtime = 'nodejs'

const solicitudSchema = z.object({
  uso: z.enum(['EVALUACION_INICIAL', 'EVALUACION_TOMO']),
  cursoId: z.string().uuid(),
  tomoId: z.string().uuid().optional(),
})

const errorResponse = (error: string, status: number): NextResponse =>
  NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request): Promise<NextResponse> {
  if (!(await docenteHabilitado())) {
    return errorResponse('Requiere rol docente y verificación en dos pasos.', 403)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Envía un contexto válido para la evaluación.', 400)
  }

  const solicitud = solicitudSchema.safeParse(body)
  if (!solicitud.success) return errorResponse('Selecciona un curso y una evaluación válidos.', 400)
  if (solicitud.data.uso === 'EVALUACION_TOMO' && !solicitud.data.tomoId) {
    return errorResponse('Selecciona la semana que quieres evaluar.', 400)
  }

  try {
    const curso = await catalogApi.cursoAdmin(solicitud.data.cursoId)
    if (!curso) return errorResponse('No encontré el curso seleccionado.', 404)

    const tomos =
      solicitud.data.uso === 'EVALUACION_TOMO'
        ? curso.tomos.filter(tomo => tomo.id === solicitud.data.tomoId)
        : curso.tomos
    if (tomos.length === 0) return errorResponse('La semana no pertenece al curso.', 400)

    const lecciones = tomos.flatMap(tomo => tomo.lecciones).slice(0, 8)
    const contenidos = await Promise.all(
      lecciones.map(async leccion => ({
        titulo: leccion.titulo,
        contenido: await catalogApi.contenidoAdmin(leccion.id).catch(() => null),
      })),
    )

    const materiales = tomos.flatMap(tomo =>
      tomo.materiales.map(
        material =>
          `Material: ${material.titulo}\n${material.textoExtraido ?? material.descripcion ?? ''}`,
      ),
    )
    const textosLecciones = contenidos.map(({ titulo, contenido }) => {
      const bloques = contenido?.bloques ?? []
      const texto = bloques
        .flatMap(bloque => Object.values(bloque.contenido))
        .filter((valor): valor is string => typeof valor === 'string')
        .join('\n')
      return `Lección: ${titulo}\n${texto}`
    })
    const fuentes = [...materiales, ...textosLecciones].filter(texto => texto.trim())
    if (fuentes.length === 0) {
      return errorResponse('Sube un PDF o agrega contenido a las lecciones antes de generar.', 400)
    }

    await reserveAssistantChatQuota()
    const tomo = tomos[0]
    const preguntas = await generarPreguntasEvaluacion({
      uso: solicitud.data.uso,
      curso: curso.titulo,
      ...(solicitud.data.uso === 'EVALUACION_TOMO' ? { semana: tomo?.titulo } : {}),
      nivel: `${curso.nivelMin}-${curso.nivelMax}`,
      contenido: fuentes.join('\n\n').slice(0, 12000),
    })

    return NextResponse.json(
      {
        titulo:
          solicitud.data.uso === 'EVALUACION_INICIAL'
            ? `Test inicial · ${curso.titulo}`
            : `Evaluación semanal · ${tomo?.titulo ?? curso.titulo}`,
        preguntas,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof AssistantProviderError && error.code === 'quota-exceeded') {
      return errorResponse('Se alcanzó el límite mensual de IA. Inténtalo el próximo mes.', 429)
    }
    if (error instanceof AssistantProviderError && error.code === 'not-configured') {
      return errorResponse('El generador de evaluaciones todavía no está configurado.', 503)
    }
    return errorResponse(
      'No pude generar la evaluación. Revisa el material e inténtalo otra vez.',
      502,
    )
  }
}
