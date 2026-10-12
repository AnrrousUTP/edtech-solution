import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { COOKIE_ACCESO, COOKIE_PERFIL, COOKIE_REFRESH } from '@/lib/sesion'

export const GET = async (): Promise<Response> => {
  const redireccion = NextResponse.redirect(new URL('/', config.appUrl))
  for (const cookie of [COOKIE_ACCESO, COOKIE_REFRESH, COOKIE_PERFIL]) {
    redireccion.cookies.delete(cookie)
  }
  return redireccion
}
