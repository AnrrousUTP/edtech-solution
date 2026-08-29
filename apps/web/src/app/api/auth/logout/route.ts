import { NextResponse } from 'next/server'
import { config, hayCognito } from '@/lib/config'
import { COOKIE_ACCESO, COOKIE_PERFIL, COOKIE_REFRESH } from '@/lib/sesion'

export const GET = async (): Promise<Response> => {
  const destino = hayCognito()
    ? `${config.cognito.dominio}/logout?client_id=${config.cognito.clientId}&logout_uri=${encodeURIComponent(config.appUrl)}`
    : config.appUrl

  const redireccion = NextResponse.redirect(destino)
  for (const cookie of [COOKIE_ACCESO, COOKIE_REFRESH, COOKIE_PERFIL]) {
    redireccion.cookies.delete(cookie)
  }
  return redireccion
}
