import { NextResponse } from 'next/server'
import { catalogApi } from '@/api/catalog'
import { ErrorApi } from '@/lib/api'
import { esAdmin } from '@/lib/sesion'

export const POST = async (peticion: Request): Promise<Response> => {
  // Doble comprobación: acá por comodidad de UX y en el servicio por seguridad.
  // La que cuenta es la del servicio (requiereRol('admin'), doc 08 §6).
  if (!(await esAdmin())) {
    return NextResponse.json({ error: 'Requiere rol admin' }, { status: 403 })
  }

  const cuerpo = (await peticion.json()) as {
    cursoId: string
    accion: 'publicar' | 'despublicar' | 'precio'
    motivo?: string
    precio?: number
  }

  try {
    if (cuerpo.accion === 'publicar') {
      return NextResponse.json(await catalogApi.publicar(cuerpo.cursoId))
    }
    if (cuerpo.accion === 'despublicar') {
      return NextResponse.json(
        await catalogApi.despublicar(cuerpo.cursoId, cuerpo.motivo ?? 'sin motivo'),
      )
    }
    if (cuerpo.accion === 'precio' && typeof cuerpo.precio === 'number') {
      return NextResponse.json(await catalogApi.cambiarPrecio(cuerpo.cursoId, cuerpo.precio))
    }
    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
  } catch (err) {
    if (err instanceof ErrorApi) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Error inesperado' }, { status: 500 })
  }
}
