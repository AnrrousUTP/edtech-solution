import { NextResponse } from 'next/server'
import { enrollmentApi } from '@/api/enrollment'
import { ErrorApi } from '@/lib/api'
import { esAdmin } from '@/lib/sesion'

export const POST = async (peticion: Request): Promise<Response> => {
  if (!(await esAdmin())) return NextResponse.json({ error: 'Requiere rol admin' }, { status: 403 })
  const cuerpo = (await peticion.json()) as { usuarioId?: string; cursoId?: string }
  if (!cuerpo.usuarioId || !cuerpo.cursoId)
    return NextResponse.json({ error: 'Faltan usuarioId y cursoId' }, { status: 400 })
  try {
    return NextResponse.json(
      await enrollmentApi.matricularManual(cuerpo.usuarioId, cuerpo.cursoId),
      { status: 201 },
    )
  } catch (err) {
    if (err instanceof ErrorApi)
      return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'No se pudo crear la matrícula' }, { status: 500 })
  }
}
