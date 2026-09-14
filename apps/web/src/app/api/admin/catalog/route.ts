import { NextResponse } from 'next/server'
import { catalogApi } from '@/api/catalog'
import { ErrorApi } from '@/lib/api'
import { esAdmin } from '@/lib/sesion'

export const POST = async (peticion: Request): Promise<Response> => {
  if (!(await esAdmin())) return NextResponse.json({ error: 'Requiere rol admin' }, { status: 403 })
  const cuerpo = (await peticion.json()) as {
    accion?: string
    id?: string
    datos?: Record<string, unknown>
  }
  try {
    if (cuerpo.accion === 'crear-curso')
      return NextResponse.json(await catalogApi.crear(cuerpo.datos ?? {}), { status: 201 })
    if (cuerpo.accion === 'actualizar-curso' && cuerpo.id)
      return NextResponse.json(await catalogApi.actualizar(cuerpo.id, cuerpo.datos ?? {}))
    if (cuerpo.accion === 'contenido' && cuerpo.id)
      return NextResponse.json(
        await catalogApi.actualizarContenido(
          cuerpo.id,
          Array.isArray(cuerpo.datos?.tomos) ? cuerpo.datos.tomos : [],
        ),
      )
    if (cuerpo.accion === 'crear-carrera')
      return NextResponse.json(await catalogApi.crearCarrera(cuerpo.datos ?? {}), { status: 201 })
    if (cuerpo.accion === 'actualizar-carrera' && cuerpo.id)
      return NextResponse.json(await catalogApi.actualizarCarrera(cuerpo.id, cuerpo.datos ?? {}))
    if (cuerpo.accion === 'crear-banco')
      return NextResponse.json(await catalogApi.crearBanco(cuerpo.datos ?? {}), { status: 201 })
    if (cuerpo.accion === 'actualizar-banco' && cuerpo.id)
      return NextResponse.json(await catalogApi.actualizarBanco(cuerpo.id, cuerpo.datos ?? {}))
    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
  } catch (err) {
    if (err instanceof ErrorApi)
      return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'No se pudo guardar el cambio' }, { status: 500 })
  }
}
