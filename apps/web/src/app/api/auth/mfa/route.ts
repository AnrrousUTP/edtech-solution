import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { asociarTotp, confirmarTotp } from '@/lib/cognito'
import { config } from '@/lib/config'
import {
  COOKIE_ACCESO,
  COOKIE_PERFIL,
  COOKIE_REFRESH,
  accessToken,
  claimsDeToken,
  perfilSesion,
  rolDeGrupos,
} from '@/lib/sesion'

// Configuración del segundo factor del docente (doc 08 §6). El access token no sale
// de acá: el navegador manda el código de 6 dígitos y nada más.
export const POST = async (peticion: Request): Promise<Response> => {
  const origen = peticion.headers.get('origin')
  if (!origen || origen !== new URL(config.appUrl).origin)
    return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 })

  const token = await accessToken()
  const perfil = await perfilSesion()
  if (token === null || perfil === null) {
    return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  }
  if (perfil.rol !== 'docente') {
    return NextResponse.json({ error: 'Se requiere el rol docente' }, { status: 403 })
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

      const almacen = await cookies()
      const refresh = almacen.get(COOKIE_REFRESH)?.value
      if (!refresh || !config.cognito.dominio || !config.cognito.clientId) {
        return NextResponse.json(
          {
            error: 'MFA quedó activado. Inicia sesión otra vez para continuar.',
            requiereInicioSesion: true,
          },
          { status: 503 },
        )
      }

      const cuerpo = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.cognito.clientId,
        refresh_token: refresh,
      })
      const renovacion = await fetch(`${config.cognito.dominio}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: cuerpo,
        cache: 'no-store',
      }).catch(() => null)
      if (!renovacion?.ok) {
        return NextResponse.json(
          {
            error: 'MFA quedó activado. Inicia sesión otra vez para continuar.',
            requiereInicioSesion: true,
          },
          { status: 503 },
        )
      }

      const tokens = (await renovacion.json().catch(() => null)) as {
        access_token?: string
        id_token?: string
        refresh_token?: string
        expires_in?: number
      } | null
      if (!tokens || !tokens.access_token || !tokens.id_token) {
        return NextResponse.json(
          {
            error: 'MFA quedó activado. Inicia sesión otra vez para continuar.',
            requiereInicioSesion: true,
          },
          { status: 503 },
        )
      }
      const claimsAcceso = claimsDeToken(tokens.access_token) ?? {}
      const claimsId = claimsDeToken(tokens.id_token) ?? {}
      if (
        claimsAcceso.token_use !== 'access' ||
        rolDeGrupos(claimsAcceso['cognito:groups']) !== 'docente' ||
        claimsAcceso.mfa_pendiente === 'true' ||
        claimsAcceso.mfa_pendiente === true ||
        claimsId.mfa_pendiente === 'true' ||
        claimsId.mfa_pendiente === true
      ) {
        return NextResponse.json(
          {
            error: 'MFA quedó activado. Inicia sesión otra vez para continuar.',
            requiereInicioSesion: true,
          },
          { status: 503 },
        )
      }

      const respuesta = NextResponse.json({ listo: true })
      const seguridad = {
        httpOnly: true,
        secure: config.appUrl.startsWith('https://') || config.production,
        sameSite: 'lax' as const,
        path: '/',
      }
      const edad = Math.max(60, tokens.expires_in ?? 3600)
      respuesta.cookies.set(COOKIE_ACCESO, tokens.access_token, { ...seguridad, maxAge: edad })
      if (tokens.refresh_token) {
        respuesta.cookies.set(COOKIE_REFRESH, tokens.refresh_token, {
          ...seguridad,
          maxAge: 30 * 24 * 3600,
        })
      }
      respuesta.cookies.set(
        COOKIE_PERFIL,
        encodeURIComponent(
          JSON.stringify({
            ...perfil,
            usuarioId: String(claimsAcceso.sub ?? perfil.usuarioId),
            email: String(claimsId.email ?? perfil.email),
            rol: 'docente',
            roles: ['docente'],
            mfaPendiente: false,
          }),
        ),
        { ...seguridad, maxAge: edad },
      )
      return respuesta
    }

    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error inesperado'
    return NextResponse.json({ error: mensaje }, { status: 400 })
  }
}
