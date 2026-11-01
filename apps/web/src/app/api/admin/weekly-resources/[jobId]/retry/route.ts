import { NextResponse } from 'next/server'
import {
  canRetryWeeklyResourceDelivery,
  claimWeeklyResourceRedelivery,
  createWeeklyResourceToken,
  getWeeklyResourceJob,
  weeklyResourcesIntegrationConfigured,
} from '@/lib/assistant/weekly-resources'
import { config } from '@/lib/config'
import { docenteHabilitado, perfilSesion } from '@/lib/sesion'

export const runtime = 'nodejs'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  if (!(await docenteHabilitado())) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  if (!weeklyResourcesIntegrationConfigured())
    return NextResponse.json({ error: 'La integración de Make aún no está configurada.' }, { status: 503 })

  const [{ jobId }, profile] = await Promise.all([params, perfilSesion()])
  const job = await getWeeklyResourceJob(jobId).catch(() => null)
  if (!job || !profile || job.userId !== profile.usuarioId)
    return NextResponse.json({ error: 'Trabajo no encontrado.' }, { status: 404 })
  if (!canRetryWeeklyResourceDelivery(job))
    return NextResponse.json(
      { status: job.status, error: 'El envío todavía está activo. Espera antes de reintentarlo.' },
      { status: 409 },
    )

  try {
    const claimed = await claimWeeklyResourceRedelivery(jobId)
    if (!claimed)
      return NextResponse.json(
        { error: 'Otro reintento ya está en curso. Consulta el estado en un momento.' },
        { status: 409 },
      )

    const callbackUrl = new URL(
      '/api/integrations/make/weekly-resources/process',
      config.appUrl,
    ).toString()
    const response = await fetch(config.assistant.makeWeeklyWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, callbackUrl, token: createWeeklyResourceToken(jobId) }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error('Make no aceptó el reintento.')
    return NextResponse.json({ jobId, status: job.status, enviadoDeNuevo: true }, { status: 202 })
  } catch {
    return NextResponse.json(
      { error: 'No se pudo reenviar el trabajo a Make. Puedes intentarlo de nuevo más tarde.' },
      { status: 502 },
    )
  }
}
