import { NextResponse } from 'next/server'
import { catalogApi } from '@/api/catalog'
import { ErrorApi } from '@/lib/api'
import { docenteHabilitado } from '@/lib/sesion'

export const POST = async (peticion: Request): Promise<Response> => {
  if (!(await docenteHabilitado()))
    return NextResponse.json({ error: 'Requiere rol docente con MFA configurado' }, { status: 403 })
  const cuerpo = (await peticion.json()) as {
    accion?: string
    id?: string
    datos?: Record<string, unknown>
  }
  try {
    if (cuerpo.accion === 'crear-curso') {
      const datos = cuerpo.datos ?? {}
      const existentes = await catalogApi.cursosAdmin()
      const slug = slugUnico(String(datos.titulo ?? ''), existentes.map(curso => curso.slug))
      return NextResponse.json(await catalogApi.crear({ ...datos, slug }), { status: 201 })
    }
    if (cuerpo.accion === 'actualizar-curso' && cuerpo.id)
      return NextResponse.json(await catalogApi.actualizar(cuerpo.id, cuerpo.datos ?? {}))
    if (cuerpo.accion === 'contenido' && cuerpo.id)
      return NextResponse.json(
        await catalogApi.actualizarContenido(
          cuerpo.id,
          Array.isArray(cuerpo.datos?.tomos) ? cuerpo.datos.tomos : [],
          cuerpo.datos?.generarFlashcards === true,
          Array.isArray(cuerpo.datos?.tomosParaGenerarFlashcards)
            ? (cuerpo.datos.tomosParaGenerarFlashcards as string[])
            : undefined,
        ),
      )
    if (cuerpo.accion === 'crear-carrera') {
      const datos = cuerpo.datos ?? {}
      const existentes = await catalogApi.carrerasAdmin()
      const slug = slugUnico(String(datos.titulo ?? ''), existentes.map(carrera => carrera.slug))
      return NextResponse.json(await catalogApi.crearCarrera({ ...datos, slug }), { status: 201 })
    }
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

const slugUnico = (titulo: string, registrados: string[]): string => {
  const base = titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'contenido'
  const slugs = new Set(registrados)
  if (!slugs.has(base)) return base
  let sufijo = 2
  while (slugs.has(base + '-' + sufijo)) sufijo += 1
  return base + '-' + sufijo
}
