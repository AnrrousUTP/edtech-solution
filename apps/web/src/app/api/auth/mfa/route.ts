import { NextResponse } from 'next/server'
import { asociarTotp, confirmarTotp } from '@/lib/cognito'
import { COOKIE_PERFIL, accessToken, perfilSesion } from '@/lib/sesion'

// Configuración del segundo factor del admin (doc 08 §6). El access token no sale
// de acá: el navegador manda el código de 6 dígitos y nada más.
export const POST = async (peticion: Request): Promise<Response> => {
  const token = await accessToken()
  const perfil = await perfilSesion()
  if (token === null || perfil === null) {
    return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  }

  const { accion, codigo } = (await peticion.json()) as { accion?: string; codigo?: string }

  try {
    if (accion === 'asociar') {
      return NextResponse.json(await asociarTotp(token, perfil.email))
    }

    if (accion === 'confirmar') {
      if (typeof codigo !== 'string' || !/^\d{6}$/.test(codigo)) {
        return NextResponse.json({ error: 'El código son 6 dígitos' }, { status: 400 })
      }
      await confirmarTotp(token, codigo)

      // El claim `mfa_pendiente` del token viejo ya no refleja la realidad, pero
      // el token no se puede reemitir sin volver a pasar por Cognito. Se corrige
      // la cookie de perfil para que el panel se desbloquee ya; el token nuevo
      // llegará sin el claim en el próximo login.
      const respuesta = NextResponse.json({ listo: true })
      respuesta.cookies.set(
        COOKIE_PERFIL,
        encodeURIComponent(JSON.stringify({ ...perfil, mfaPendiente: false })),
        { secure: true, sameSite: 'lax', path: '/', maxAge: 3600 },
      )
      return respuesta
    }

    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error inesperado'
    return NextResponse.json({ error: mensaje }, { status: 400 })
  }
}
