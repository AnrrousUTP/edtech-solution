import { NextResponse } from 'next/server'
import { gamificationApi } from '@/api/resto'
import { ErrorApi } from '@/lib/api'
import { esAdmin } from '@/lib/sesion'

export const POST = async (peticion: Request): Promise<Response> => {
  if (!(await esAdmin())) return NextResponse.json({ error: 'Requiere rol admin' }, { status: 403 })
  const cuerpo = (await peticion.json()) as {
    tipo?: 'curso' | 'carrera'
    datos?: Record<string, string>
  }
  try {
    if (cuerpo.tipo === 'carrera')
      return NextResponse.json(
        await gamificationApi.otorgarCarrera({
          carreraId: cuerpo.datos?.carreraId ?? '',
          carreraTitulo: cuerpo.datos?.carreraTitulo ?? '',
          usuarioId: cuerpo.datos?.usuarioId ?? '',
        }),
      )
    return NextResponse.json(
      await gamificationApi.otorgarCurso({
        cursoId: cuerpo.datos?.cursoId ?? '',
        cursoTitulo: cuerpo.datos?.cursoTitulo ?? '',
        usuarioId: cuerpo.datos?.usuarioId ?? '',
      }),
    )
  } catch (err) {
    if (err instanceof ErrorApi)
      return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'No se pudo otorgar la credencial' }, { status: 500 })
  }
}
