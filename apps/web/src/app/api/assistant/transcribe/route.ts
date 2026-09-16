import { NextResponse } from 'next/server'
import { MAX_ASSISTANT_AUDIO_BYTES } from '@/lib/assistant/config'
import { AssistantProviderError } from '@/lib/assistant/openai'
import { transcribeAssistantAudio } from '@/lib/assistant/elevenlabs'

export const runtime = 'nodejs'

const errorResponse = (message: string, status: number): NextResponse =>
  NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return errorResponse('No pude leer el audio enviado.', 400)
  }

  const entry = form.get('audio')
  if (!entry || typeof entry === 'string' || typeof entry.size !== 'number') {
    return errorResponse('Adjunta un audio para transcribir.', 400)
  }

  if (entry.size === 0) {
    return errorResponse('El audio está vacío.', 400)
  }

  if (entry.size > MAX_ASSISTANT_AUDIO_BYTES) {
    return errorResponse('El audio supera el límite de 5 MB.', 413)
  }

  try {
    const text = await transcribeAssistantAudio(entry as File)
    return NextResponse.json({ text }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof AssistantProviderError && error.code === 'not-configured') {
      return errorResponse('La transcripción todavía no está configurada.', 503)
    }

    return errorResponse('No pude transcribir el audio. Inténtalo nuevamente.', 502)
  }
}
