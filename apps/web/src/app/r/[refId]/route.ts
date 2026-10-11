import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { llamar, ErrorApi } from '@/lib/api'
import { config, destinoInterno } from '@/lib/config'
import { COOKIE_REFERIDO } from '@/lib/referidos'
export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ refId: string }> },
): Promise<Response> => {
  if (!config.affiliatesEnabled) return NextResponse.redirect(new URL('/cursos', config.appUrl))
  const { refId } = await params
  try {
    const previous = (await cookies()).get(COOKIE_REFERIDO)?.value
    const visita = await llamar(
      `/api/affiliates/referidos/${encodeURIComponent(refId)}/visitas`,
      z.object({ visitaId: z.string().uuid(), destino: z.string() }),
      { metodo: 'POST', autenticado: false, cuerpo: { visitaAnterior: previous } },
    )
    const destino = new URL(destinoInterno(visita.destino, '/cursos'), config.appUrl)
    destino.searchParams.set('referido', 'registrado')
    const response = NextResponse.redirect(destino)
    response.cookies.set(COOKIE_REFERIDO, visita.visitaId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 86400,
      secure: new URL(config.appUrl).protocol === 'https:',
    })
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'same-origin')
    return response
  } catch (error) {
    const response = NextResponse.redirect(
      new URL(
        `/cursos?referido=${error instanceof ErrorApi && error.status === 404 ? 'inactivo' : 'error'}`,
        config.appUrl,
      ),
    )
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}
