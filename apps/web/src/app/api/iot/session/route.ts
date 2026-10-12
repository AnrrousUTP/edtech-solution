import { NextResponse } from 'next/server'
import { z } from 'zod'
import { afiliadosApi } from '@/api/afiliados'
import { assistantSession } from '@/lib/assistant/auth'
import { config } from '@/lib/config'
import { crearUrlMqttFirmada } from '@/lib/iot/presigned-url'
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts'

export const runtime = 'nodejs'
const requestSchema = z.object({ terminalId: z.string().uuid().optional() }).strict()
const errorResponse = (message: string, status: number): NextResponse =>
  NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request): Promise<NextResponse> {
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(config.appUrl).origin) {
    return errorResponse('Origen de solicitud no permitido.', 403)
  }
  if (!config.iot.enabled || !config.iot.endpoint || !config.iot.sessionRoleArn) {
    return errorResponse('La conexión IoT todavía no está habilitada.', 503)
  }
  const session = await assistantSession()
  if (!session) return errorResponse('Inicia sesión para conectar el terminal.', 401)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('La solicitud no es válida.', 400)
  }
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) return errorResponse('El terminal indicado no es válido.', 400)

  try {
    const terminal = parsed.data.terminalId
      ? (await afiliadosApi.adminTerminales()).terminales.find(
          item => item.id === parsed.data.terminalId,
        )
      : (await afiliadosApi.terminal()).terminal
    if (!terminal || (!parsed.data.terminalId && terminal.usuarioId !== session.userId)) {
      return errorResponse('No tienes acceso a este terminal.', 403)
    }

    const sts = new STSClient({ region: config.cognito.region })
    const assumed = await sts.send(
      new AssumeRoleCommand({
        RoleArn: config.iot.sessionRoleArn,
        RoleSessionName: `terminal-${terminal.id.slice(0, 24)}`,
        DurationSeconds: 900,
        Tags: [{ Key: 'terminalId', Value: config.iot.thingName }],
      }),
    )
    const credentials = assumed.Credentials
    if (!credentials?.AccessKeyId || !credentials.SecretAccessKey || !credentials.SessionToken) {
      return errorResponse('No se pudo crear la sesión temporal del terminal.', 503)
    }
    const url = await crearUrlMqttFirmada({
      endpoint: config.iot.endpoint,
      region: config.cognito.region,
      credentials: {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken,
      },
    })
    return NextResponse.json(
      {
        terminalId: terminal.id,
        thingName: config.iot.thingName,
        clientId: `edtech-${config.iot.thingName}`,
        url,
        expiresAt: credentials.Expiration,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return errorResponse('No se pudo abrir una sesión IoT para este terminal.', 503)
  }
}
