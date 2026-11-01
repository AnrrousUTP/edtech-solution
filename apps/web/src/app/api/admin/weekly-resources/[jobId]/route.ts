import { NextResponse } from 'next/server'
import {
  canRetryWeeklyResourceDelivery,
  getWeeklyResourceJob,
} from '@/lib/assistant/weekly-resources'
import { docenteHabilitado, perfilSesion } from '@/lib/sesion'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  if (!(await docenteHabilitado())) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  const [{ jobId }, profile] = await Promise.all([params, perfilSesion()])
  const job = await getWeeklyResourceJob(jobId).catch(() => null)
  if (!job || !profile || job.userId !== profile.usuarioId)
    return NextResponse.json({ error: 'Trabajo no encontrado.' }, { status: 404 })
  return NextResponse.json(
    {
      jobId: job.jobId,
      status: job.status,
      retryable: canRetryWeeklyResourceDelivery(job),
      error: job.error,
      priorQuestions: job.priorQuestions,
      reviewQuestions: job.reviewQuestions,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
