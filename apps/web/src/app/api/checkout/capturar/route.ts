import { NextResponse } from 'next/server'
import { llamar } from '@/lib/api'
import { ErrorApi } from '@/lib/api'
import { z } from 'zod'

export const POST = async (peticion: Request): Promise<Response> => {
  const { ordenId } = (await peticion.json()) as { ordenId?: string }
  if (!ordenId) return NextResponse.json({ error: 'Falta ordenId' }, { status: 400 })

  try {
    const resultado = await llamar(
      `/api/payments/ordenes/${ordenId}/capturar`,
      z.object({
        estado: z.string(),
        capturaId: z.string().nullable(),
        yaEstabaCapturada: z.boolean(),
      }),
      { metodo: 'POST' },
    )
    return NextResponse.json(resultado)
  } catch (err) {
    if (err instanceof ErrorApi) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Error inesperado' }, { status: 500 })
  }
}
