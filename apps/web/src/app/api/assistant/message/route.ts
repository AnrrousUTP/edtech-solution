import { NextResponse } from 'next/server'
import { z } from 'zod'
import { MAX_ASSISTANT_HISTORY, MAX_ASSISTANT_MESSAGE_LENGTH } from '@/lib/assistant/config'
import { AssistantProviderError, generateAssistantReply } from '@/lib/assistant/bedrock'
import { config } from '@/lib/config'
import { accessToken } from '@/lib/sesion'
import { reserveAssistantChatQuota } from '@/lib/assistant/quota'

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
  const token = await accessToken()
  if (!token) return errorResponse('Inicia sesión para utilizar el asistente.', 401)

  let perfil: { rol?: string } | null = null
  try {
    const auth = await fetch(`${config.apiBase}/api/identity/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!auth.ok) return errorResponse('Tu sesión expiró. Vuelve a iniciar sesión.', 401)
    const body = (await auth.json()) as { data?: { rol?: string } }
    perfil = body.data ?? null
  } catch {
    return errorResponse('No pude validar tu sesión ahora.', 503)
  }

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

  if (!config.assistant.enabled) {
    return errorResponse('El asistente todavía no está configurado.', 503)
  }

  try {
    await reserveAssistantChatQuota()
    const pregunta = parsed.data.messages.at(-1)?.content ?? ''
    const pideCatalogo = /curso|cursos|ruta|rutas/i.test(pregunta)
    let datosCatalogo = ''
    if (pideCatalogo) {
      try {
        const ruta = perfil?.rol?.toLowerCase() === 'docente' ? '/api/catalog/admin/cursos' : '/api/catalog/cursos'
        const catalogo = await fetch(`${config.catalogApiBase}${ruta}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        if (catalogo.ok) {
          const body = (await catalogo.json()) as { data?: unknown }
          const cursos = Array.isArray(body.data) ? body.data : []
          datosCatalogo = `Cursos disponibles para este usuario: ${JSON.stringify(
            cursos.slice(0, 30).map(valor => {
              const curso = valor as Record<string, unknown>
              return {
                nombre: curso.titulo,
                area: curso.tecnologia,
                estado: curso.estado,
                nivel: String(curso.nivelMin ?? '') + '-' + String(curso.nivelMax ?? ''),
              }
            }),
          )}`
        }
      } catch {
        datosCatalogo = ''
      }
    }
    const contexto = {
      ...parsed.data.context,
      pageSummary: [parsed.data.context?.pageSummary, datosCatalogo].filter(Boolean).join('\n'),
    }
    const text = await generateAssistantReply(parsed.data.messages, contexto)
    return NextResponse.json({ text }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof AssistantProviderError && error.code === 'not-configured') {
      return errorResponse('El asistente todavía no está configurado.', 503)
    }
    if (error instanceof AssistantProviderError && error.code === 'quota-exceeded') {
      return errorResponse(
        'Se alcanzó el límite mensual del asistente. Inténtalo el próximo mes.',
        429,
      )
    }

    return errorResponse('No pude responder ahora. Inténtalo nuevamente en unos segundos.', 502)
  }
}
