import { NextRequest, NextResponse } from 'next/server'
import { config as appConfig } from '@/lib/config'

// The access token lasts one hour; Cognito's refresh token lasts 30 days.
// Refresh just before expiry so Server Components can verify a live token on
// the same request. Both cookies remain httpOnly and never reach client JS.
const COOKIE_ACCESS = 'edtech_access'
const COOKIE_REFRESH = 'edtech_refresh'
const COOKIE_PROFILE = 'edtech_perfil'
const REFRESH_EARLY_SECONDS = 120

// Amplify supports Next middleware on its Node.js compute runtime. Avoid
// invoking it for framework assets and public files.
export const config = {
  runtime: 'nodejs',
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|map)$).*)',
  ],
}

type Tokens = {
  access_token?: string
  id_token?: string
  refresh_token?: string
  expires_in?: number
}

const claimsFromJwt = (token: string): Record<string, unknown> | null => {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), character => character.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
  } catch {
    return null
  }
}

const expirationFromJwt = (token: string): number | null => {
  const expiration = claimsFromJwt(token)?.exp
  return typeof expiration === 'number' && Number.isFinite(expiration) ? expiration : null
}

const profileCookieFromTokens = (tokens: Tokens): string | null => {
  if (!tokens.access_token) return null
  const accessClaims = claimsFromJwt(tokens.access_token)
  const idClaims = tokens.id_token ? claimsFromJwt(tokens.id_token) : null
  const userId = accessClaims?.sub ?? idClaims?.sub
  if (typeof userId !== 'string' || !userId) return null
  const email = idClaims?.email ?? accessClaims?.username ?? ''
  const name =
    idClaims?.['custom:nombre_visible'] ??
    idClaims?.nombre_visible ??
    idClaims?.name ??
    email ??
    'Usuario'
  return encodeURIComponent(
    JSON.stringify({
      usuarioId: userId,
      email: typeof email === 'string' ? email : '',
      nombre: typeof name === 'string' ? name : 'Usuario',
    }),
  )
}

const continuar = (): NextResponse => NextResponse.next()

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  if (
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/api/auth/')
  )
    return continuar()

  const refreshToken = request.cookies.get(COOKIE_REFRESH)?.value
  if (!refreshToken) return continuar()

  const accessToken = request.cookies.get(COOKIE_ACCESS)?.value
  const expiration = accessToken ? expirationFromJwt(accessToken) : null
  const now = Math.floor(Date.now() / 1000)
  if (expiration !== null && expiration - now > REFRESH_EARLY_SECONDS) return continuar()

  const domain = appConfig.cognito.dominio.replace(/\/+$/, '')
  const clientId = appConfig.cognito.clientId
  if (!domain || !clientId) return continuar()

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
    })
    const tokenResponse = await fetch(`${domain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    })
    if (!tokenResponse.ok) return continuar()

    const tokens = (await tokenResponse.json()) as Tokens
    if (!tokens.access_token) return continuar()
    const maxAge =
      typeof tokens.expires_in === 'number' && Number.isFinite(tokens.expires_in)
        ? Math.max(60, Math.min(tokens.expires_in, 24 * 60 * 60))
        : 3600
    const secure = request.nextUrl.protocol === 'https:'

    // Forward refreshed cookies to this request as well as the browser; this
    // avoids one expired-token redirect before the browser receives Set-Cookie.
    request.cookies.set(COOKIE_ACCESS, tokens.access_token)
    if (tokens.refresh_token) request.cookies.set(COOKIE_REFRESH, tokens.refresh_token)
    const profile = request.cookies.get(COOKIE_PROFILE)?.value ?? profileCookieFromTokens(tokens)
    if (profile) request.cookies.set(COOKIE_PROFILE, profile)
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('cookie', request.cookies.toString())

    const response = NextResponse.next({ request: { headers: requestHeaders } })
    const cookieOptions = {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      path: '/',
      maxAge,
    }
    response.cookies.set(COOKIE_ACCESS, tokens.access_token, cookieOptions)
    if (tokens.refresh_token) {
      response.cookies.set(COOKIE_REFRESH, tokens.refresh_token, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60,
      })
    }
    if (profile) {
      response.cookies.set(COOKIE_PROFILE, profile, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60,
      })
    }
    return response
  } catch {
    // A transient Cognito/network error should not clear a usable refresh token.
    return continuar()
  }
}
