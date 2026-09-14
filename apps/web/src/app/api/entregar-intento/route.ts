import { NextResponse } from 'next/server'
import { enrollmentApi } from '@/api/enrollment'
import { ErrorApi } from '@/lib/api'

// Inicia y entrega el intento en una sola llamada del cliente. Toda la regla
// (corrección, puntaje, nivel) vive en el servidor (doc 11 §7.1).
export const POST = async (peticion: Request): Promise<Response> => {
  const cuerpo = (await peticion.json()) as {
    tipo: 'NIVELACION' | 'TOMO' | 'DIAGNOSTICO_PREVIO' | 'REFUERZO'
    bancoId: string
    cursoId?: string
    tomoId?: string
    respuestas: { preguntaId: string; respuesta: unknown }[]
  }

  try {
    const { intentoId } = await enrollmentApi.iniciarIntento({
      tipo: cuerpo.tipo,
      bancoId: cuerpo.bancoId,
      ...(cuerpo.cursoId ? { cursoId: cuerpo.cursoId } : {}),
      ...(cuerpo.tomoId ? { tomoId: cuerpo.tomoId } : {}),
    })
    return NextResponse.json(await enrollmentApi.entregarIntento(intentoId, cuerpo.respuestas))
  } catch (err) {
    if (err instanceof ErrorApi) {
      // 503 = la corrección no está disponible (A-19): el mensaje ya dice qué hacer
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Error inesperado' }, { status: 500 })
  }
}
