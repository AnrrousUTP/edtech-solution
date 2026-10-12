import { NextResponse } from 'next/server'
import { AssistantProviderError } from '@/lib/assistant/bedrock'
import { assistantSession } from '@/lib/assistant/auth'
import { consultarTranscripcion } from '@/lib/assistant/transcribe'

export const runtime = 'nodejs'
const errorResponse = (message: string, status: number): NextResponse =>
  NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: Request): Promise<NextResponse> {
  const session = await assistantSession()
  if (!session) return errorResponse('Inicia sesión para consultar la transcripción.', 401)
  const jobId = new URL(request.url).searchParams.get('jobId')
  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId))
    return errorResponse('El trabajo de audio no es válido.', 400)
  try {
    const result = await consultarTranscripcion(session.userId, jobId)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof AssistantProviderError && error.code === 'not-configured') {
      return errorResponse('La transcripción todavía no está configurada.', 503)
    }
    return errorResponse('No pude consultar el estado de la transcripción.', 502)
  }
}
