import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { afiliadosApi } from '@/api/afiliados'
import { config } from '@/lib/config'
import { ErrorApi } from '@/lib/api'
export const GET = async (req: Request): Promise<Response> => {
  if (!config.affiliatesEnabled) return new Response(null, { status: 404 })
  try {
    const a = await afiliadosApi.yo()
    if (!a) return NextResponse.json({ error: 'Activa tu afiliación' }, { status: 404 })
    const link = new URL(`/r/${a.refId}`, config.appUrl).toString()
    const png = new URL(req.url).searchParams.get('formato') === 'png'
    const data = png
      ? await QRCode.toBuffer(link, { width: 768, margin: 4, errorCorrectionLevel: 'M' })
      : await QRCode.toString(link, { type: 'svg', margin: 4, errorCorrectionLevel: 'M' })
    return new Response(png ? new Uint8Array(data as Buffer) : String(data), {
      headers: {
        'Content-Type': png ? 'image/png' : 'image/svg+xml',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `inline; filename="mi-qr-edtech.${png ? 'png' : 'svg'}"`,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'No se pudo generar el QR' },
      { status: error instanceof ErrorApi ? error.status : 503 },
    )
  }
}
