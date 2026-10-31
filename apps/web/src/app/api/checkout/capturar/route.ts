import { NextResponse } from 'next/server'
import { paymentsApi } from '@/api/resto'
import { ErrorApi } from '@/lib/api'
import { perfilSesion } from '@/lib/sesion'

export const POST = async (request: Request): Promise<Response> => {
  const perfil = await perfilSesion()
  if (!perfil)
    return NextResponse.json({ error: 'Inicia sesión para confirmar el pago.' }, { status: 401 })
  if (perfil.rol !== 'estudiante')
    return NextResponse.json(
      { error: 'La confirmación requiere una cuenta de estudiante.' },
      { status: 403 },
    )

  const body = (await request.json().catch(() => ({}))) as { ordenId?: string }
  if (!body.ordenId?.trim())
    return NextResponse.json({ error: 'Falta el identificador de la orden.' }, { status: 400 })

  try {
    return NextResponse.json(await paymentsApi.capturarPago(body.ordenId))
  } catch (error) {
    if (error instanceof ErrorApi)
      return NextResponse.json(
        { error: error.message, codigo: error.codigo },
        { status: error.status },
      )
    return NextResponse.json({ error: 'No se pudo confirmar el pago.' }, { status: 502 })
  }
}
