import { NextResponse } from 'next/server'
import { flashcardsApi } from '@/api/resto'
import { docenteHabilitado } from '@/lib/sesion'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tomoId: string }> },
): Promise<NextResponse> {
  if (!(await docenteHabilitado()))
    return NextResponse.json({ error: 'Requiere rol docente con MFA configurado.' }, { status: 403 })

  const { tomoId } = await params
  try {
    const mazos = (await flashcardsApi.mazosAdmin(tomoId)) ?? []
    return NextResponse.json(mazos, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'No se pudo consultar el estado de las flashcards.' }, { status: 502 })
  }
}
