import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { accessToken } from '@/lib/sesion'
const resolver = (a: string[], method: string): string | null => {
  const joined = a.join('/')
  const paths: Record<string, string> = {
    'POST activar': '/api/affiliates/me',
    'PUT configuracion': '/api/affiliates/me',
    'GET ingresos': '/api/affiliates/ingresos',
    'GET notificaciones': '/api/affiliates/notificaciones',
    'GET terminal': '/api/iot/me',
    'PUT terminal': '/api/iot/me',
    'POST terminal/solicitud': '/api/iot/solicitud',
    'GET admin/afiliados': '/api/affiliates/admin',
    'GET admin/terminales': '/api/iot/admin',
    'PUT admin/terminales/asignacion': '/api/iot/admin/asignacion',
  }
  if (paths[`${method} ${joined}`]) return paths[`${method} ${joined}`]!
  if (
    method === 'POST' &&
    a.length === 3 &&
    a[0] === 'notificaciones' &&
    a[2] === 'leida' &&
    /^[0-9a-f-]{36}$/i.test(a[1] ?? '')
  )
    return `/api/affiliates/notificaciones/${a[1]}/leida`
  if (
    method === 'PUT' &&
    a.length === 3 &&
    a[0] === 'admin' &&
    a[1] === 'afiliados' &&
    /^[0-9a-f-]{36}$/i.test(a[2] ?? '')
  )
    return `/api/affiliates/admin/${a[2]}`
  return null
}
const proxy = async (
  req: Request,
  { params }: { params: Promise<{ accion: string[] }> },
): Promise<Response> => {
  if (!config.affiliatesEnabled)
    return NextResponse.json({ error: { message: 'Programa no habilitado' } }, { status: 404 })
  const token = await accessToken()
  if (!token)
    return NextResponse.json(
      { error: { message: 'Inicia sesión para continuar' } },
      { status: 401 },
    )
  const origin = req.headers.get('origin')
  if (
    req.method !== 'GET' &&
    origin &&
    ![new URL(req.url).origin, new URL(config.appUrl).origin].includes(origin)
  )
    return NextResponse.json({ error: { message: 'Origen no permitido' } }, { status: 403 })
  const ruta = resolver((await params).accion, req.method)
  if (!ruta)
    return NextResponse.json({ error: { message: 'Operación no encontrada' } }, { status: 404 })
  const query = new URL(req.url).searchParams
  const forwarded = new URLSearchParams()
  if (req.method === 'GET')
    for (const k of ['desde', 'hasta', 'cursor']) if (query.has(k)) forwarded.set(k, query.get(k)!)
  const body = req.method === 'GET' ? undefined : await req.text()
  if (body && body.length > 8192)
    return NextResponse.json({ error: { message: 'Solicitud demasiado grande' } }, { status: 413 })
  try {
    const r = await fetch(
      `${config.servicesApiBase}${ruta}${forwarded.size ? `?${forwarded}` : ''}`,
      {
        method: req.method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body,
        cache: 'no-store',
      },
    )
    const text = await r.text()
    return new Response(text, {
      status: r.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json(
      { error: { message: 'No se pudo contactar al servicio. Intenta de nuevo.' } },
      { status: 503 },
    )
  }
}
export const GET = proxy
export const POST = proxy
export const PUT = proxy
