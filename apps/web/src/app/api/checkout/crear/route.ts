import { NextResponse } from 'next/server'
import { paymentsApi } from '@/api/resto'
import { ErrorApi } from '@/lib/api'

export const POST = async (peticion: Request): Promise<Response> => {
  const { cursoId } = (await peticion.json()) as { cursoId?: string }
  if (!cursoId) return NextResponse.json({ error: 'Falta cursoId' }, { status: 400 })

  try {
    const orden = await paymentsApi.crearOrden(cursoId)
    return NextResponse.json(orden)
  } catch (err) {
    if (err instanceof ErrorApi) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Error inesperado' }, { status: 500 })
  }
}
