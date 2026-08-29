import { NextResponse } from 'next/server'
import { enrollmentApi } from '@/api/enrollment'
import { ErrorApi } from '@/lib/api'

// Proxy del servidor: el navegador no ve el access token (doc 08 §7). Toda la
// regla vive en la API; esto solo reenvía con la credencial de la sesión.
export const POST = async (peticion: Request): Promise<Response> => {
  const { cursoId } = (await peticion.json()) as { cursoId?: string }
  if (!cursoId) return NextResponse.json({ error: 'Falta cursoId' }, { status: 400 })

  try {
    return NextResponse.json(await enrollmentApi.matricularGratuito(cursoId))
  } catch (err) {
    if (err instanceof ErrorApi) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Error inesperado' }, { status: 500 })
  }
}
