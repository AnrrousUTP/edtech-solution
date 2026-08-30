import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { COOKIE_ACCESO, COOKIE_PERFIL, COOKIE_REFRESH, claimsDeToken } from '@/lib/sesion'

// Intercambia el código por tokens y los guarda en cookies httpOnly (doc 08 §7).
// El navegador nunca ve el access token.
export const GET = async (peticion: Request): Promise<Response> => {
  const url = new URL(peticion.url)
  const codigo = url.searchParams.get('code')
  const estado = url.searchParams.get('state')

  const almacen = await cookies()
  const verificador = almacen.get('pkce_verificador')?.value
  const estadoEsperado = almacen.get('pkce_estado')?.value
  const destino = almacen.get('pkce_destino')?.value ?? '/dashboard'

  if (!codigo || !verificador || !estado || estado !== estadoEsperado) {
    return NextResponse.redirect(new URL('/?error=auth', config.appUrl))
  }

  const cuerpo = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.cognito.clientId,
    code: codigo,
    redirect_uri: `${config.appUrl}/api/auth/callback`,
    code_verifier: verificador,
  })

  const respuesta = await fetch(`${config.cognito.dominio}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: cuerpo,
  })
  if (!respuesta.ok) return NextResponse.redirect(new URL('/?error=token', config.appUrl))

  const tokens = (await respuesta.json()) as {
    access_token: string
    refresh_token?: string
    id_token?: string
    expires_in: number
  }

  const redireccion = NextResponse.redirect(new URL(destino, config.appUrl))
  const seguro = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' }

  redireccion.cookies.set(COOKIE_ACCESO, tokens.access_token, {
    ...seguro,
    maxAge: tokens.expires_in,
  })
  if (tokens.refresh_token) {
    redireccion.cookies.set(COOKIE_REFRESH, tokens.refresh_token, {
      ...seguro,
      maxAge: 30 * 24 * 3600,
    })
  }

  // Perfil legible por el cliente: SOLO datos de presentación, nunca el token
  const claimsAcceso = claimsDeToken(tokens.access_token) ?? {}
  const claimsId = tokens.id_token ? (claimsDeToken(tokens.id_token) ?? {}) : {}
  const grupos = claimsAcceso['cognito:groups']
  redireccion.cookies.set(
    COOKIE_PERFIL,
    encodeURIComponent(
      JSON.stringify({
        usuarioId: String(claimsAcceso.sub ?? ''),
        email: String(claimsId.email ?? ''),
        nombre: String(claimsId.nombre_visible ?? claimsId.email ?? 'Estudiante'),
        roles: Array.isArray(grupos) ? grupos : [],
        // El claim viaja en el ID token, no en el de acceso: pre_token_generation
        // solo puede tocar el primero (doc 08 §6).
        mfaPendiente: String(claimsId.mfa_pendiente ?? '') === 'true',
      }),
    ),
    { secure: true, sameSite: 'lax', path: '/', maxAge: tokens.expires_in },
  )

  for (const efimera of ['pkce_verificador', 'pkce_estado', 'pkce_destino']) {
    redireccion.cookies.delete(efimera)
  }
  return redireccion
}
