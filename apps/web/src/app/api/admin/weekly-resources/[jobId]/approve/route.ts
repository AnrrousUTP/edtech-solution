import { NextResponse } from 'next/server'
import { catalogApi } from '@/api/catalog'
import {
  claimWeeklyResourceApproval,
  getWeeklyResourceJob,
  updateWeeklyResourceJob,
} from '@/lib/assistant/weekly-resources'
import { docenteHabilitado, perfilSesion } from '@/lib/sesion'

export const runtime = 'nodejs'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  if (!(await docenteHabilitado())) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  const [{ jobId }, profile] = await Promise.all([params, perfilSesion()])
  const job = await getWeeklyResourceJob(jobId).catch(() => null)
  if (!job || !profile || job.userId !== profile.usuarioId)
    return NextResponse.json({ error: 'Trabajo no encontrado.' }, { status: 404 })
  if (job.status === 'APPROVED')
    return NextResponse.json({
      status: 'APPROVED',
      alreadyApproved: true,
      priorBankId: job.priorBankId,
      reviewBankId: job.reviewBankId,
    })
  if (!job.priorQuestions || !job.reviewQuestions)
    return NextResponse.json({ error: 'Los borradores aún no están listos.' }, { status: 409 })
  if (job.status !== 'READY' && job.status !== 'APPROVING')
    return NextResponse.json({ error: 'Este trabajo no está listo para aprobación.' }, { status: 409 })

  try {
    const claimed = await claimWeeklyResourceApproval(jobId)
    if (!claimed) {
      const latest = await getWeeklyResourceJob(jobId)
      if (latest?.status === 'APPROVED')
        return NextResponse.json({
          status: 'APPROVED',
          alreadyApproved: true,
          priorBankId: latest.priorBankId,
          reviewBankId: latest.reviewBankId,
        })
      return NextResponse.json(
        {
          status: latest?.status ?? 'NOT_FOUND',
          error: 'La aprobación sigue en curso. Espera un momento y vuelve a consultar.',
        },
        { status: 409 },
      )
    }

    let priorBankId = job.priorBankId
    let reviewBankId = job.reviewBankId
    if (!priorBankId) {
      const result = await catalogApi.crearBanco({
        uso: 'CONOCIMIENTO_PREVIO_TOMO',
        tomoId: job.tomoId,
        titulo: `Conocimiento previo · ${job.weekTitle}`,
        preguntas: job.priorQuestions,
      })
      priorBankId = result.bancoId
      await updateWeeklyResourceJob(jobId, { priorBankId })
    }
    if (!reviewBankId) {
      const result = await catalogApi.crearBanco({
        uso: 'REFUERZO',
        tomoId: job.tomoId,
        titulo: `Repaso semanal · ${job.weekTitle}`,
        preguntas: job.reviewQuestions,
      })
      reviewBankId = result.bancoId
      await updateWeeklyResourceJob(jobId, { reviewBankId })
    }
    await updateWeeklyResourceJob(jobId, { status: 'APPROVED' })
    return NextResponse.json({ status: 'APPROVED', alreadyApproved: false, priorBankId, reviewBankId })
  } catch {
    await updateWeeklyResourceJob(
      jobId,
      {
        status: 'READY',
        error: 'La aprobación se interrumpió. Revisa el estado y vuelve a intentarlo.',
      },
    ).catch(() => undefined)
    return NextResponse.json(
      { error: 'No se pudieron guardar los bancos. El borrador quedó disponible para reintentar.' },
      { status: 502 },
    )
  }
}
