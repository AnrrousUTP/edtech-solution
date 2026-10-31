import { NextResponse } from 'next/server'
import { paymentsApi } from '@/api/resto'
import { ErrorApi } from '@/lib/api'
import { perfilSesion } from '@/lib/sesion'

export const dynamic = 'force-dynamic'

export const GET = async (request: Request): Promise<Response> => {
  const perfil = await perfilSesion()
  if (!perfil)
    return NextResponse.json({ error: 'Inicia sesión para revisar tu pago.' }, { status: 401 })
  if (perfil.rol !== 'estudiante')
    return NextResponse.json(
      { error: 'La orden pertenece a una cuenta de estudiante.' },
      { status: 403 },
    )

  const ordenId = new URL(request.url).searchParams.get('ordenId')
  if (!ordenId)
    return NextResponse.json({ error: 'Falta el identificador de la orden.' }, { status: 400 })

  try {
    const orden = await paymentsApi.estadoOrden(ordenId)
    if (!orden) return NextResponse.json({ error: 'No se encontró la orden.' }, { status: 404 })
    return NextResponse.json(
      { ordenId: orden.ordenId, cursoId: orden.cursoId, estado: orden.estado },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  } catch (error) {
    if (error instanceof ErrorApi)
      return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'No se pudo consultar la orden.' }, { status: 502 })
  }
}
