import { NextResponse } from 'next/server'
import { flashcardsApi } from '@/api/resto'
import { ErrorApi } from '@/lib/api'
import { esAdmin } from '@/lib/sesion'

export const POST = async (peticion: Request): Promise<Response> => {
  if (!(await esAdmin())) {
    return NextResponse.json({ error: 'Requiere rol admin' }, { status: 403 })
  }

  const cuerpo = (await peticion.json()) as {
    mazoId: string
    tarjetaId: string
    accion: 'aprobar' | 'rechazar'
    anverso?: string
    reverso?: string
    motivo?: string
  }

  try {
    if (cuerpo.accion === 'aprobar') {
      const edicion =
        cuerpo.anverso && cuerpo.reverso
          ? { anverso: cuerpo.anverso, reverso: cuerpo.reverso }
          : undefined
      return NextResponse.json(
        await flashcardsApi.aprobar(cuerpo.mazoId, cuerpo.tarjetaId, edicion),
      )
    }
    return NextResponse.json(
      await flashcardsApi.rechazar(cuerpo.mazoId, cuerpo.tarjetaId, cuerpo.motivo ?? ''),
    )
  } catch (err) {
    if (err instanceof ErrorApi) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Error inesperado' }, { status: 500 })
  }
}
