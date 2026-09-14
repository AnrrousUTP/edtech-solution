import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { authLocalDisponible, config, destinoInterno, hayCognito } from '@/lib/config'

// Login con el Hosted UI de Cognito y Authorization Code + PKCE (doc 08 §7).
// No se escribe un formulario de login propio: ahorra el manejo de errores de
// credenciales, verificación y recuperación, que es más código del que parece.
const base64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url')

export const GET = async (peticion: Request): Promise<Response> => {
  const url = new URL(peticion.url)
  const destino = destinoInterno(url.searchParams.get('destino'))
  const modo = url.searchParams.get('modo')

  if (!hayCognito() && authLocalDisponible()) {
    // Desarrollo local sin Cognito: el emisor local firma el token (doc 08 §8)
    return NextResponse.redirect(
      new URL(`/api/auth/local?destino=${encodeURIComponent(destino)}`, config.appUrl),
    )
  }

  if (!hayCognito()) return NextResponse.redirect(new URL('/?error=sin-idp', config.appUrl))

  const verificador = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const reto = base64url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador))),
  )
  const estado = base64url(crypto.getRandomValues(new Uint8Array(16)))

  const almacen = await cookies()
  const opciones = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    maxAge: 600,
    path: '/',
  }
  almacen.set('pkce_verificador', verificador, opciones)
  almacen.set('pkce_estado', estado, opciones)
  almacen.set('pkce_destino', destino, opciones)

  const autorizacion = new URL(`${config.cognito.dominio}/oauth2/authorize`)
  autorizacion.searchParams.set('response_type', 'code')
  autorizacion.searchParams.set('client_id', config.cognito.clientId)
  autorizacion.searchParams.set('redirect_uri', `${config.appUrl}/api/auth/callback`)
  // `aws.cognito.signin.user.admin` es lo que permite el autoservicio del propio
  // usuario —el alta del TOTP del admin (doc 08 §6)— sin credenciales IAM. El
  // token vive solo en una cookie httpOnly que lee el servidor (A-57).
  autorizacion.searchParams.set('scope', 'openid profile email aws.cognito.signin.user.admin')
  autorizacion.searchParams.set('state', estado)
  autorizacion.searchParams.set('code_challenge', reto)
  autorizacion.searchParams.set('code_challenge_method', 'S256')
  if (modo === 'registro') autorizacion.searchParams.set('screen_hint', 'signup')

  return NextResponse.redirect(autorizacion)
}
