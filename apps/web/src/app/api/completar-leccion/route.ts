import { NextResponse } from 'next/server'
import { enrollmentApi } from '@/api/enrollment'
import { ErrorApi } from '@/lib/api'

export const POST = async (peticion: Request): Promise<Response> => {
  const { leccionId, cursoId } = (await peticion.json()) as {
    leccionId?: string
    cursoId?: string
  }
  if (!leccionId || !cursoId) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }

  try {
    return NextResponse.json(await enrollmentApi.completarLeccion(leccionId, cursoId))
  } catch (err) {
    if (err instanceof ErrorApi) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Error inesperado' }, { status: 500 })
  }
}
