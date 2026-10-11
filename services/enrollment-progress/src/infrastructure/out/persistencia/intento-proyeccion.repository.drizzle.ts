import { UniqueId } from '@edtech/shared-kernel'
import { IntentoEvaluacion } from '../../../domain/entities/intento-evaluacion.entity'
import type { IntentoRepository } from '../../../domain/ports-out/intento.repository'
import type {
  CursoProyeccionRepository,
  ProyeccionEntrada,
} from '../../../domain/ports-out/curso-proyeccion.repository'
import {
  CursoProyectado,
  type TomoProyectado,
} from '../../../domain/value-objects/curso-proyectado.vo'
import type { Db } from './db'

const intento = async (db: Db, fila: Record<string, unknown>): Promise<IntentoEvaluacion> => {
  const rs = await db.query(
    'SELECT pregunta_id, respuesta, correcta FROM enrollment.respuestas_intento WHERE intento_id = $1',
    [fila.id],
  )
  return IntentoEvaluacion.reconstruir({
    id: UniqueId.desde(String(fila.id)),
    usuarioId: UniqueId.desde(String(fila.usuario_id)),
    tipo: String(fila.tipo),
    bancoId: UniqueId.desde(String(fila.banco_id)),
    matriculaId: fila.matricula_id ? UniqueId.desde(String(fila.matricula_id)) : null,
    tomoId: fila.tomo_id ? String(fila.tomo_id) : null,
    estado: String(fila.estado),
    puntaje: fila.puntaje === null ? null : Number(fila.puntaje),
    aprobado: fila.aprobado === null ? null : Boolean(fila.aprobado),
    nivelResultante: fila.nivel_resultante ?? null,
    iniciadoAt: new Date(fila.iniciado_at),
    entregadoAt: fila.entregado_at ? new Date(fila.entregado_at) : null,
    respuestas: rs.rows.map(r => ({
      preguntaId: String(r.pregunta_id),
      respuesta: r.respuesta,
      correcta: r.correcta,
    })),
  } as never)
}

export class DrizzleIntentoRepository implements IntentoRepository {
  constructor(private readonly db: Db) {}
  async porId(id: UniqueId): Promise<IntentoEvaluacion | null> {
    const r = await this.db.query('SELECT * FROM enrollment.intentos_evaluacion WHERE id = $1', [
      id.valor,
    ])
    return r.rows[0] ? intento(this.db, r.rows[0]) : null
  }
  async guardar(i: IntentoEvaluacion): Promise<void> {
    await this.db.query(
      `INSERT INTO enrollment.intentos_evaluacion (id,usuario_id,tipo,banco_id,matricula_id,tomo_id,estado,puntaje,aprobado,nivel_resultante,iniciado_at,entregado_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO UPDATE SET estado=EXCLUDED.estado,puntaje=EXCLUDED.puntaje,aprobado=EXCLUDED.aprobado,nivel_resultante=EXCLUDED.nivel_resultante,entregado_at=EXCLUDED.entregado_at`,
      [
        i.id.valor,
        i.usuarioId.valor,
        i.tipo,
        i.bancoId.valor,
        i.matriculaId?.valor ?? null,
        i.tomoId,
        i.estado,
        i.puntaje,
        i.aprobado,
        i.nivel,
        i.iniciadoAt,
        i.entregadoAt,
      ],
    )
    await this.db.query('DELETE FROM enrollment.respuestas_intento WHERE intento_id = $1', [
      i.id.valor,
    ])
    for (const r of i.respuestas)
      await this.db.query(
        'INSERT INTO enrollment.respuestas_intento (intento_id,pregunta_id,respuesta,correcta) VALUES ($1,$2,$3,$4)',
        [i.id.valor, r.preguntaId, JSON.stringify(r.respuesta), r.correcta],
      )
  }
  async ultimoNivelacionDe(usuarioId: UniqueId): Promise<IntentoEvaluacion | null> {
    const r = await this.db.query(
      `SELECT * FROM enrollment.intentos_evaluacion WHERE usuario_id = $1 AND tipo = 'NIVELACION' ORDER BY iniciado_at DESC LIMIT 1`,
      [usuarioId.valor],
    )
    return r.rows[0] ? intento(this.db, r.rows[0]) : null
  }
  async ultimoEvaluacionInicialDe(
    usuarioId: UniqueId,
    cursoId: UniqueId,
  ): Promise<IntentoEvaluacion | null> {
    const r = await this.db.query(
      `SELECT i.* FROM enrollment.intentos_evaluacion i JOIN enrollment.matriculas m ON m.id = i.matricula_id WHERE i.usuario_id = $1 AND m.curso_id = $2 AND i.tipo = 'EVALUACION_INICIAL' AND i.estado = 'ENTREGADO' ORDER BY i.entregado_at DESC LIMIT 1`,
      [usuarioId.valor, cursoId.valor],
    )
    return r.rows[0] ? intento(this.db, r.rows[0]) : null
  }
}

type EstructuraTomo = {
  tomoId: string
  orden: number
  titulo: string
  umbral: number
  lecciones: { id: string }[]
}
const curso = (row: Record<string, unknown>): CursoProyectado => {
  const estructura = (row.estructura ?? []) as EstructuraTomo[]
  return new CursoProyectado(
    String(row.curso_id),
    String(row.titulo),
    String(row.slug),
    Boolean(row.publicado),
    Number(row.precio),
    row.nivel_max ? String(row.nivel_max).trim() : null,
    estructura.map(t => ({
      id: t.tomoId,
      orden: t.orden,
      titulo: t.titulo,
      umbral: t.umbral,
      leccionIds: t.lecciones.map(l => l.id),
    })),
  )
}
export class DrizzleCursoProyeccionRepository implements CursoProyeccionRepository {
  constructor(private readonly db: Db) {}
  async porId(cursoId: string): Promise<CursoProyectado | null> {
    const r = await this.db.query(
      'SELECT * FROM enrollment.cursos_proyeccion WHERE curso_id = $1',
      [cursoId],
    )
    return r.rows[0] ? curso(r.rows[0]) : null
  }
  async guardar(e: ProyeccionEntrada): Promise<void> {
    await this.db.query(
      `INSERT INTO enrollment.cursos_proyeccion (curso_id,titulo,slug,publicado,precio,nivel_max,estructura) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (curso_id) DO UPDATE SET titulo=EXCLUDED.titulo,slug=EXCLUDED.slug,publicado=EXCLUDED.publicado,precio=EXCLUDED.precio,nivel_max=EXCLUDED.nivel_max,estructura=EXCLUDED.estructura,actualizado_at=now()`,
      [
        e.cursoId,
        e.titulo,
        e.slug,
        e.publicado,
        e.precio,
        e.nivelMax,
        JSON.stringify(e.estructura),
      ],
    )
  }
  async marcarPublicado(cursoId: string, publicado: boolean): Promise<void> {
    await this.db.query(
      'UPDATE enrollment.cursos_proyeccion SET publicado = $1, actualizado_at = now() WHERE curso_id = $2',
      [publicado, cursoId],
    )
  }
  async actualizarTomo(
    cursoId: string,
    tomoId: string,
    lecciones: { id: string; titulo: string }[],
  ): Promise<void> {
    const r = await this.db.query(
      'SELECT estructura FROM enrollment.cursos_proyeccion WHERE curso_id = $1',
      [cursoId],
    )
    const estructura = ((r.rows[0]?.estructura ?? []) as EstructuraTomo[]).map(t =>
      t.tomoId === tomoId
        ? { ...t, lecciones: lecciones.map((l, i) => ({ ...l, orden: i + 1 })) }
        : t,
    )
    await this.db.query(
      'UPDATE enrollment.cursos_proyeccion SET estructura = $1, actualizado_at = now() WHERE curso_id = $2',
      [JSON.stringify(estructura), cursoId],
    )
  }
}
