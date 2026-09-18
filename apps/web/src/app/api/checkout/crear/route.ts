import { NextResponse } from 'next/server'
import { paymentsApi } from '@/api/resto'
import { ErrorApi } from '@/lib/api'
import { config } from '@/lib/config'

export const POST = async (peticion: Request): Promise<Response> => {
  const { cursoId, cursoSlug } = (await peticion.json()) as {
    cursoId?: string
    cursoSlug?: string
  }
  if (!cursoId || !cursoSlug)
    return NextResponse.json({ error: 'Faltan cursoId y cursoSlug' }, { status: 400 })

  try {
    const checkout = `/checkout/${encodeURIComponent(cursoSlug)}`
    const orden = await paymentsApi.crearOrden(cursoId, {
      urlRetorno: new URL(checkout, config.appUrl).toString(),
      urlCancelacion: new URL(checkout, config.appUrl).toString(),
    })
    return NextResponse.json(orden)
  } catch (err) {
    if (err instanceof ErrorApi) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Error inesperado' }, { status: 500 })
  }
}
