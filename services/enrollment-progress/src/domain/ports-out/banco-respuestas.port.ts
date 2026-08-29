import type { Result } from '@edtech/shared-kernel'
import type { PreguntaCorrecta } from '../services/correccion.service'
import type { BancoNoDisponibleError } from '../module.errors'

export type BancoConRespuestas = {
  bancoId: string
  umbral: number | null
  preguntas: PreguntaCorrecta[]
}

/** A-19: lectura síncrona interna a catalog para corregir. Lectura, fuera del
 *  camino caliente (solo al entregar), con timeout y degradación: si falla, el
 *  intento sigue EN_CURSO y el estudiante reintenta. */
export interface BancoRespuestasPort {
  respuestasDe(bancoId: string): Promise<Result<BancoConRespuestas, BancoNoDisponibleError>>
}
