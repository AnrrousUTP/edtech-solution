import { NextResponse } from 'next/server'
import { enrollmentApi } from '@/api/enrollment'

export const dynamic = 'force-dynamic'

// El polling usa la consulta puntual del curso, que lee la matrícula por clave
// primaria. Evita esperar a que el índice secundario de "mis matrículas"
// refleje una inscripción recién creada.
export const GET = async (peticion: Request): Promise<Response> => {
  const cursoId = new URL(peticion.url).searchParams.get('cursoId')
  if (!cursoId)
    return NextResponse.json({ activa: false }, { headers: { 'Cache-Control': 'no-store' } })

  const progreso = await enrollmentApi.progreso(cursoId).catch(() => null)
  const activa = progreso?.estado === 'ACTIVA'
  return NextResponse.json({ activa }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}
