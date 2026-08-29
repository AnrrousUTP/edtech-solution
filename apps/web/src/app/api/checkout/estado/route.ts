import { NextResponse } from 'next/server'
import { enrollmentApi } from '@/api/enrollment'

// El polling del checkout pregunta por la MATRÍCULA, no por la orden: lo que
// el estudiante espera es el acceso al curso (doc 09 §2, paso 12).
export const GET = async (peticion: Request): Promise<Response> => {
  const cursoId = new URL(peticion.url).searchParams.get('cursoId')
  if (!cursoId) return NextResponse.json({ activa: false })

  const matriculas = await enrollmentApi.misMatriculas().catch(() => [])
  const activa = matriculas.some(m => m.cursoId === cursoId && m.estado === 'ACTIVA')
  return NextResponse.json({ activa })
}
