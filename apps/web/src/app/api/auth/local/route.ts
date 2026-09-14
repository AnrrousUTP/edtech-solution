import { NextResponse } from 'next/server'
import { authLocalDisponible, config, destinoInterno } from '@/lib/config'
import { COOKIE_ACCESO, COOKIE_PERFIL, claimsDeToken } from '@/lib/sesion'

const cookieOptions = { sameSite: 'lax' as const, path: '/', maxAge: 3600 }

const respuestaError = (mensaje: string, status: number): Response =>
  NextResponse.json({ error: mensaje }, { status })

const pedir = async (accion: string, cuerpo: Record<string, unknown>): Promise<Response> => {
  try {
    const respuesta = await fetch(`${config.cognito.issuerLocal}/${accion}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    const datos = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>
    if (!respuesta.ok)
      return respuestaError(
        String(datos.error ?? 'No se pudo completar la acción'),
        respuesta.status,
      )
    return NextResponse.json(datos)
  } catch {
    return respuestaError(
      'El proveedor local no está disponible. Inicia jwt-local para continuar.',
      503,
    )
  }
}

const guardarSesion = (
  respuesta: NextResponse,
  tokens: { access_token: string; id_token?: string },
  destino: string,
): Response => {
  const claimsAcceso = claimsDeToken(tokens.access_token) ?? {}
  const claimsId = tokens.id_token ? (claimsDeToken(tokens.id_token) ?? {}) : {}
  respuesta.cookies.set(COOKIE_ACCESO, tokens.access_token, { httpOnly: true, ...cookieOptions })
  respuesta.cookies.set(
    COOKIE_PERFIL,
    encodeURIComponent(
      JSON.stringify({
        usuarioId: String(claimsAcceso.sub ?? ''),
        email: String(claimsId.email ?? ''),
        nombre: String(claimsId.nombre_visible ?? claimsId.email ?? 'Usuario Local'),
        roles: Array.isArray(claimsAcceso['cognito:groups'])
          ? claimsAcceso['cognito:groups']
          : ['estudiante'],
      }),
    ),
    cookieOptions,
  )
  respuesta.headers.set('x-auth-destino', destino)
  return respuesta
}

// SOLO desarrollo local: pide un token al emisor local (doc 08 §8), que emite
// JWT con la MISMA forma que Cognito. En AWS esta ruta no se usa porque
// hayCognito() es true y /api/auth/login redirige al Hosted UI.
export const GET = async (peticion: Request): Promise<Response> => {
  if (!authLocalDisponible()) {
    return NextResponse.redirect(new URL('/?error=sin-idp', config.appUrl))
  }

  const url = new URL(peticion.url)
  const destino = destinoInterno(url.searchParams.get('destino'))
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

export const POST = async (peticion: Request): Promise<Response> => {
  if (!authLocalDisponible()) return respuestaError('El proveedor local no está habilitado', 503)

  const cuerpo = (await peticion.json().catch(() => ({}))) as Record<string, unknown>
  const accion = typeof cuerpo.accion === 'string' ? cuerpo.accion : ''
  const destino = destinoInterno(typeof cuerpo.destino === 'string' ? cuerpo.destino : null)

  if (['register', 'confirm', 'forgot', 'reset'].includes(accion)) {
    const { accion: _accion, destino: _destino, ...datos } = cuerpo
    return pedir(accion, datos)
  }

  if (accion !== 'login') return respuestaError('Acción de autenticación desconocida', 400)

  const respuesta = await fetch(`${config.cognito.issuerLocal}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cuerpo.email, password: cuerpo.password }),
  }).catch(() => null)
  if (!respuesta)
    return respuestaError(
      'El proveedor local no está disponible. Inicia jwt-local para continuar.',
      503,
    )
  const datos = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>
  if (!respuesta.ok || typeof datos.access_token !== 'string') {
    return respuestaError(String(datos.error ?? 'No se pudo iniciar sesión'), respuesta.status)
  }

  return guardarSesion(
    NextResponse.json({ ok: true, destino }),
    {
      access_token: datos.access_token,
      id_token: typeof datos.id_token === 'string' ? datos.id_token : undefined,
    },
    destino,
  )
}
