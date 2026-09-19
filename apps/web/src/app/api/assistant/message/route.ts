import { NextResponse } from 'next/server'
import { z } from 'zod'
import { MAX_ASSISTANT_HISTORY, MAX_ASSISTANT_MESSAGE_LENGTH } from '@/lib/assistant/config'
import { AssistantProviderError, generateAssistantReply } from '@/lib/assistant/openai'

export const runtime = 'nodejs'

const messageSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(MAX_ASSISTANT_MESSAGE_LENGTH),
      }),
    )
    .min(1)
    .max(MAX_ASSISTANT_HISTORY),
  context: z
    .object({
      pathname: z.string().max(200).optional(),
      pageTitle: z.string().max(160).optional(),
      pageSummary: z.string().max(1200).optional(),
    })
    .optional(),
})

const errorResponse = (message: string, status: number): NextResponse =>
  NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('El mensaje no tiene un formato válido.', 400)
  }

  const parsed = messageSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse('Envía un mensaje válido para continuar.', 400)
  }

  const totalLength = parsed.data.messages.reduce(
    (total, message) => total + message.content.length,
    0,
  )
  if (totalLength > 6000) {
    return errorResponse('La conversación es demasiado larga. Inicia una nueva consulta.', 400)
  }

  try {
    const text = await generateAssistantReply(parsed.data.messages, parsed.data.context)
    return NextResponse.json({ text }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof AssistantProviderError && error.code === 'not-configured') {
      return errorResponse('El asistente todavía no está configurado.', 503)
    }

    return errorResponse('No pude responder ahora. Inténtalo nuevamente en unos segundos.', 502)
  }
}
