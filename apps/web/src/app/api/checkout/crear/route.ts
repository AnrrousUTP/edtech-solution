import { NextResponse } from 'next/server'
import { paymentsApi } from '@/api/resto'
import { ErrorApi } from '@/lib/api'
import { config } from '@/lib/config'
import { cookies } from 'next/headers'
import { afiliadosApi } from '@/api/afiliados'
import { COOKIE_REFERIDO } from '@/lib/referidos'

export const POST = async (peticion: Request): Promise<Response> => {
  const { cursoId, cursoSlug } = (await peticion.json()) as {
    cursoId?: string
    cursoSlug?: string
  }
  if (!cursoId || !cursoSlug)
    return NextResponse.json({ error: 'Faltan cursoId y cursoSlug' }, { status: 400 })

  try {
    const checkout = `/checkout/${encodeURIComponent(cursoSlug)}`
    const referencia = config.affiliatesEnabled
      ? await afiliadosApi.prueba((await cookies()).get(COOKIE_REFERIDO)?.value)
      : null
    const orden = await paymentsApi.crearOrden(cursoId, {
      urlRetorno: new URL(checkout, config.appUrl).toString(),
      urlCancelacion: new URL(checkout, config.appUrl).toString(),
      ...(referencia?.prueba ? { pruebaAtribucion: referencia.prueba } : {}),
    })
    return NextResponse.json(orden)
  } catch (err) {
    if (err instanceof ErrorApi) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Error inesperado' }, { status: 500 })
  }
}
