import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AssistantProviderError, generarPreguntasEvaluacion } from '@/lib/assistant/bedrock'
import { reserveAssistantChatQuota } from '@/lib/assistant/quota'
import {
  getWeeklyResourceJob,
  markWeeklyResourceProcessing,
  updateWeeklyResourceJob,
  verifyWeeklyResourceToken,
} from '@/lib/assistant/weekly-resources'

export const runtime = 'nodejs'

const inputSchema = z.object({ jobId: z.string().uuid(), token: z.string().min(20) })

export async function POST(request: Request): Promise<NextResponse> {
  const input = inputSchema.safeParse(await request.json().catch(() => null))
  if (!input.success || !verifyWeeklyResourceToken(input.data.jobId, input.data.token))
    return NextResponse.json({ error: 'Credencial de automatización inválida o vencida.' }, { status: 401 })

  try {
    const job = await getWeeklyResourceJob(input.data.jobId)
    if (!job) return NextResponse.json({ error: 'Trabajo no encontrado.' }, { status: 404 })
    if (job.status === 'READY' || job.status === 'APPROVED')
      return NextResponse.json({ status: job.status, duplicado: true })
    const processingLeaseActive = Boolean(
      job.processingLeaseUntil && job.processingLeaseUntil > Math.floor(Date.now() / 1000),
    )
    if (job.status === 'APPROVING' || (job.status === 'PROCESSING' && processingLeaseActive))
      return NextResponse.json({ status: job.status }, { status: 202 })
    if (job.status !== 'QUEUED' && job.status !== 'PROCESSING')
      return NextResponse.json({ status: job.status, error: job.error }, { status: 409 })

    const claimed = await markWeeklyResourceProcessing(job.jobId)
    if (!claimed) {
      const latest = await getWeeklyResourceJob(job.jobId)
      if (latest?.status === 'READY' || latest?.status === 'APPROVED')
        return NextResponse.json({ status: latest.status, duplicado: true })
      return NextResponse.json({ status: latest?.status ?? 'NOT_FOUND' }, { status: 202 })
    }
    await reserveAssistantChatQuota()
    const priorQuestions = await generarPreguntasEvaluacion({
      uso: 'CONOCIMIENTO_PREVIO_TOMO',
      curso: job.courseTitle,
      semana: job.weekTitle,
      nivel: job.level,
      contenido: job.sourcePrior,
    })
    await reserveAssistantChatQuota()
    const reviewQuestions = await generarPreguntasEvaluacion({
      uso: 'REFUERZO',
      curso: job.courseTitle,
      semana: job.weekTitle,
      nivel: job.level,
      contenido: job.sourceReview,
    })
    await updateWeeklyResourceJob(
      job.jobId,
      { status: 'READY', priorQuestions, reviewQuestions },
      true,
    )
    return NextResponse.json({ status: 'READY', recursos: 2 }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const current = await getWeeklyResourceJob(input.data.jobId).catch(() => null)
    if (current?.status === 'PROCESSING')
      await updateWeeklyResourceJob(
        input.data.jobId,
        {
          status: 'FAILED',
          error:
            error instanceof AssistantProviderError && error.code === 'quota-exceeded'
              ? 'Se alcanzó el límite mensual de IA.'
              : 'No se pudieron generar los borradores. Reintenta desde el editor docente.',
        },
        true,
      ).catch(() => undefined)
    return NextResponse.json({ error: 'No se pudieron generar los recursos semanales.' }, { status: 502 })
  }
}
