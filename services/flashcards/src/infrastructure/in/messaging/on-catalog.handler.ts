import type { Command, SobreEvento } from '@edtech/shared-kernel'
import type { SolicitarGeneracionCommand } from '../../../application/solicitar-generacion/solicitar-generacion.handler'
import type { GenerarMazoCommand } from '../../../application/generar-mazo/generar-mazo.handler'

/** catalog.contenido-actualizado.v1 → evalúa la caché y, si el hash es nuevo,
 *  crea el mazo y lo encola. Sin lógica de negocio: traduce y despacha. */
export const onContenidoActualizado = (sobre: SobreEvento): Command => {
  const p = sobre.payload
  const cmd: SolicitarGeneracionCommand = {
    _tag: 'SolicitarGeneracion',
    cursoId: String(p.cursoId),
    tomoId: String(p.tomoId),
    contenidoHash: String(p.contenidoHash),
    lecciones: Array.isArray(p.lecciones)
      ? (p.lecciones as { id: string; titulo: string; bloquesS3Key: string }[]).map(l => ({
          id: String(l.id),
          titulo: String(l.titulo),
          bloquesS3Key: String(l.bloquesS3Key),
        }))
      : [],
  }
  return cmd
}

/** Cola INTERNA de generación (no viaja por el bus). */
export const onGenerarMazo = (sobre: SobreEvento): Command => {
  const cmd: GenerarMazoCommand = {
    _tag: 'GenerarMazo',
    mazoId: String(sobre.payload.mazoId),
  }
  return cmd
}
