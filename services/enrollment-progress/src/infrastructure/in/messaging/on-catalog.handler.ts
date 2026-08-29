import type { Command, SobreEvento } from '@edtech/shared-kernel'
import type {
  ActualizarTomoProyeccionCommand,
  DespublicarProyeccionCommand,
  ProyectarCursoCommand,
} from '../../../application/actualizar-proyeccion/actualizar-proyeccion.handler'

export const onCursoPublicado = (sobre: SobreEvento): Command => {
  const p = sobre.payload
  const cmd: ProyectarCursoCommand = {
    _tag: 'ProyectarCurso',
    cursoId: String(p.cursoId),
    titulo: String(p.titulo),
    slug: String(p.slug),
    precio: Number(p.precio),
    nivelMax: typeof p.nivelMax === 'string' ? p.nivelMax : null,
    estructura: p.estructura ?? [],
  }
  return cmd
}

export const onCursoDespublicado = (sobre: SobreEvento): Command => {
  const cmd: DespublicarProyeccionCommand = {
    _tag: 'DespublicarProyeccion',
    cursoId: String(sobre.payload.cursoId),
  }
  return cmd
}

export const onContenidoActualizado = (sobre: SobreEvento): Command => {
  const p = sobre.payload
  const cmd: ActualizarTomoProyeccionCommand = {
    _tag: 'ActualizarTomoProyeccion',
    cursoId: String(p.cursoId),
    tomoId: String(p.tomoId),
    lecciones: Array.isArray(p.lecciones)
      ? (p.lecciones as { id: string; titulo: string }[]).map(l => ({
          id: String(l.id),
          titulo: String(l.titulo),
        }))
      : [],
  }
  return cmd
}
