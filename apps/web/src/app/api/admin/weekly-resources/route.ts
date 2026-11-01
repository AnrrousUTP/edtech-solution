import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { catalogApi } from '@/api/catalog'
import { config } from '@/lib/config'
import {
  createWeeklyResourceToken,
  canRetryWeeklyResourceDelivery,
  getLatestWeeklyResourceJob,
  saveWeeklyResourceJob,
  updateWeeklyResourceJob,
  weeklyResourcesIntegrationConfigured,
} from '@/lib/assistant/weekly-resources'
import { docenteHabilitado, perfilSesion } from '@/lib/sesion'

export const runtime = 'nodejs'

const requestSchema = z.object({ courseId: z.string().uuid(), tomoId: z.string().uuid() })

export async function GET(request: Request): Promise<NextResponse> {
  if (!(await docenteHabilitado()))
    return NextResponse.json(
      { error: 'Requiere rol docente con MFA configurado.' },
      { status: 403 },
    )

  const query = requestSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success)
    return NextResponse.json(
      { error: 'Selecciona un curso y una semana válidos.' },
      { status: 400 },
    )

  const profile = await perfilSesion()
  if (!profile) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  try {
    const job = await getLatestWeeklyResourceJob(
      profile.usuarioId,
      query.data.courseId,
      query.data.tomoId,
    )
    if (!job) return NextResponse.json({ job: null }, { headers: { 'Cache-Control': 'no-store' } })
    return NextResponse.json(
      {
        jobId: job.jobId,
        status: job.status,
        error: job.error,
        retryable: canRetryWeeklyResourceDelivery(job),
        priorQuestions: job.priorQuestions,
        reviewQuestions: job.reviewQuestions,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json({ error: 'No se pudo recuperar el trabajo semanal.' }, { status: 502 })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!(await docenteHabilitado()))
    return NextResponse.json(
      { error: 'Requiere rol docente con MFA configurado.' },
      { status: 403 },
    )
  if (!weeklyResourcesIntegrationConfigured())
    return NextResponse.json(
      { error: 'La integración de Make aún no está configurada.' },
      { status: 503 },
    )

  const input = requestSchema.safeParse(await request.json().catch(() => null))
  if (!input.success)
    return NextResponse.json(
      { error: 'Selecciona un curso y una semana válidos.' },
      { status: 400 },
    )

  let queuedJobId: string | undefined
  try {
    const [profile, course] = await Promise.all([
      perfilSesion(),
      catalogApi.cursoAdmin(input.data.courseId),
    ])
    const week = course?.tomos.find(tomo => tomo.id === input.data.tomoId)
    if (!profile || !course || !week)
      return NextResponse.json({ error: 'No encontré la semana seleccionada.' }, { status: 404 })

    const materials = week.materiales
      .map(material => ({
        title: material.titulo,
        enfoque: material.enfoques?.length ? material.enfoques : ['CONTENIDO_SEMANAL'],
        text: material.textoExtraido?.trim() || material.descripcion?.trim() || '',
      }))
      .filter(material => material.text.length > 0)
    const objectives = (week.objetivos ?? [])
      .map(value => value.trim().slice(0, 300))
      .filter(Boolean)
      .slice(0, 12)
    if (objectives.length === 0)
      return NextResponse.json(
        { error: 'Agrega al menos un objetivo de aprendizaje antes de generar recursos.' },
        { status: 400 },
      )
    const source = (included: string[]): string =>
      [
        `Objetivos de aprendizaje:\n${objectives.join('\n') || 'No especificados'}`,
        ...materials
          .filter(material => material.enfoque.some(value => included.includes(value)))
          .map(material => `Material: ${material.title}\n${material.text}`),
      ]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 12000)
    const sourcePrior = source(['CONOCIMIENTO_PREVIO'])
    const sourceReview = source(['CONTENIDO_SEMANAL', 'REPASO'])
    if (!sourcePrior.includes('Material:'))
      return NextResponse.json(
        { error: 'Marca al menos un material para conocimiento previo.' },
        { status: 400 },
      )
    if (!sourceReview.includes('Material:'))
      return NextResponse.json(
        { error: 'Marca al menos un material semanal o de repaso.' },
        { status: 400 },
      )

    const jobId = randomUUID()
    const createdAt = new Date().toISOString()
    const nowEpoch = Math.floor(Date.now() / 1000)
    await saveWeeklyResourceJob({
      jobId,
      userId: profile.usuarioId,
      courseId: course.id,
      tomoId: week.id,
      courseTitle: course.titulo,
      weekTitle: week.titulo,
      level: `${course.nivelMin}-${course.nivelMax}`,
      objectives,
      sourcePrior,
      sourceReview,
      status: 'QUEUED',
      createdAt,
      lastDispatchAt: nowEpoch,
      expiresAt: nowEpoch + 86_400,
    })
    queuedJobId = jobId

    const callbackUrl = new URL(
      '/api/integrations/make/weekly-resources/process',
      config.appUrl,
    ).toString()
    const webhookResponse = await fetch(config.assistant.makeWeeklyWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, callbackUrl, token: createWeeklyResourceToken(jobId) }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!webhookResponse.ok) throw new Error('Make no aceptó el trabajo.')
    return NextResponse.json(
      { jobId, status: 'QUEUED' },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    if (queuedJobId)
      await updateWeeklyResourceJob(
        queuedJobId,
        {
          status: 'FAILED',
          error: 'Make no aceptó el trabajo. Reintenta desde el editor docente.',
        },
        true,
      ).catch(() => undefined)
    return NextResponse.json(
      {
        error:
          'No se pudo iniciar la automatización semanal. Revisa la conexión con Make e inténtalo otra vez.',
      },
      { status: 502 },
    )
  }
}
