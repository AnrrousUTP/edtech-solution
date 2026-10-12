import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AssistantProviderError } from '@/lib/assistant/bedrock'
import { assistantSession } from '@/lib/assistant/auth'
import { crearCargaAudio } from '@/lib/assistant/transcribe'

export const runtime = 'nodejs'

const errorResponse = (message: string, status: number): NextResponse =>
  NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request): Promise<NextResponse> {
  const session = await assistantSession()
  if (!session) return errorResponse('Inicia sesión para transcribir audio.', 401)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('La solicitud de audio no es válida.', 400)
  }
  const parsed = z.object({ contentType: z.string().max(100) }).safeParse(body)
  if (!parsed.success) return errorResponse('El formato de audio no es válido.', 400)
  try {
    const upload = await crearCargaAudio(session.userId, parsed.data.contentType)
    return NextResponse.json(upload, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof AssistantProviderError && error.code === 'quota-exceeded') {
      return errorResponse('Se alcanzó el límite mensual de transcripción.', 429)
    }
    if (error instanceof AssistantProviderError && error.code === 'not-configured') {
      return errorResponse('La transcripción todavía no está configurada.', 503)
    }
    return errorResponse('No pude preparar la carga de audio.', 502)
  }
}
