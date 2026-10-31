import { NextResponse } from 'next/server'
import { paymentsApi } from '@/api/resto'
import { ErrorApi } from '@/lib/api'
import { config } from '@/lib/config'
import { cookies } from 'next/headers'
import { afiliadosApi } from '@/api/afiliados'
import { COOKIE_REFERIDO } from '@/lib/referidos'
import { perfilSesion } from '@/lib/sesion'

export const POST = async (peticion: Request): Promise<Response> => {
  const perfil = await perfilSesion()
  if (!perfil) return NextResponse.json({ error: 'Inicia sesión para comprar.' }, { status: 401 })
  if (perfil.rol !== 'estudiante')
    return NextResponse.json(
      { error: 'La compra requiere una cuenta de estudiante.' },
      { status: 403 },
    )

  const { cursoId } = (await peticion.json()) as {
    cursoId?: string
  }
  if (!cursoId) return NextResponse.json({ error: 'Falta cursoId' }, { status: 400 })

  try {
    const referencia = config.affiliatesEnabled
      ? await afiliadosApi.prueba((await cookies()).get(COOKIE_REFERIDO)?.value)
      : null
    const orden = await paymentsApi.crearOrden(cursoId, referencia?.prueba ?? undefined)
    return NextResponse.json(orden)
  } catch (err) {
    if (err instanceof ErrorApi) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Error inesperado' }, { status: 500 })
  }
}
