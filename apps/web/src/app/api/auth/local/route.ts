import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { COOKIE_ACCESO, COOKIE_PERFIL, claimsDeToken } from '@/lib/sesion'

// SOLO desarrollo local: pide un token al emisor local (doc 08 §8), que emite
// JWT con la MISMA forma que Cognito. En AWS esta ruta no se usa porque
// hayCognito() es true y /api/auth/login redirige al Hosted UI.
export const GET = async (peticion: Request): Promise<Response> => {
  if (!config.cognito.issuerLocal) {
    return NextResponse.redirect(new URL('/?error=sin-idp', config.appUrl))
  }

  const url = new URL(peticion.url)
  const destino = url.searchParams.get('destino') ?? '/dashboard'
  const rol = url.searchParams.get('rol') === 'admin' ? 'admin' : 'estudiante'
  const sub = url.searchParams.get('sub') ?? crypto.randomUUID()

  const respuesta = await fetch(`${config.cognito.issuerLocal}/token`, {
    method: 'POST',
    body: JSON.stringify({
      sub,
      groups: [rol],
      email: `${rol}@edtech.test`,
      nombre: rol === 'admin' ? 'Admin Local' : 'Estudiante Local',
    }),
  })
  if (!respuesta.ok) return NextResponse.redirect(new URL('/?error=jwt-local', config.appUrl))

  const { access_token } = (await respuesta.json()) as { access_token: string }
  const claims = claimsDeToken(access_token) ?? {}

  const redireccion = NextResponse.redirect(new URL(destino, config.appUrl))
  redireccion.cookies.set(COOKIE_ACCESO, access_token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 3600,
  })
  redireccion.cookies.set(
    COOKIE_PERFIL,
    encodeURIComponent(
      JSON.stringify({
        usuarioId: String(claims.sub ?? sub),
        email: `${rol}@edtech.test`,
        nombre: rol === 'admin' ? 'Admin Local' : 'Estudiante Local',
        roles: [rol],
      }),
    ),
    { sameSite: 'lax', path: '/', maxAge: 3600 },
  )
  return redireccion
}
