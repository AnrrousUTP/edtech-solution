import { UniqueId } from '@edtech/shared-kernel'
import { Matricula } from '../../../domain/entities/matricula.entity'
import type { MatriculaRepository } from '../../../domain/ports-out/matricula.repository'
import type { Db } from './db'

// eslint-disable-next-line -- la fila SQL es dinámica en el límite de persistencia
const cargar = async (db: Db, fila: Record<string, any>): Promise<Matricula> => {
  const id = String(fila.id)
  const lecciones = await db.query(
    'SELECT leccion_id, tomo_id FROM enrollment.progreso_lecciones WHERE matricula_id = $1',
    [id],
  )
  const tomos = await db.query(
    'SELECT tomo_id FROM enrollment.progreso_tomos WHERE matricula_id = $1 AND completado_at IS NOT NULL',
    [id],
  )
  return Matricula.reconstruir({
    id: UniqueId.desde(id),
    usuarioId: UniqueId.desde(String(fila.usuario_id)),
    cursoId: UniqueId.desde(String(fila.curso_id)),
    estado: String(fila.estado),
    origen: String(fila.origen),
    ordenId: fila.orden_id ? UniqueId.desde(String(fila.orden_id)) : null,
    accesoHasta: fila.acceso_hasta ? new Date(fila.acceso_hasta) : null,
    leccionesCompletadas: new Map(
      lecciones.rows.map(l => [String(l.leccion_id), String(l.tomo_id)]),
    ),
    tomosCompletados: new Set(tomos.rows.map(t => String(t.tomo_id))),
  } as never)
}

export class DrizzleMatriculaRepository implements MatriculaRepository {
  constructor(private readonly db: Db) {}
  async porId(id: UniqueId): Promise<Matricula | null> {
    const r = await this.db.query('SELECT * FROM enrollment.matriculas WHERE id = $1', [id.valor])
    return r.rows[0] ? cargar(this.db, r.rows[0]) : null
  }
  async porUsuarioYCurso(usuarioId: UniqueId, cursoId: UniqueId): Promise<Matricula | null> {
    const r = await this.db.query(
      'SELECT * FROM enrollment.matriculas WHERE usuario_id = $1 AND curso_id = $2',
      [usuarioId.valor, cursoId.valor],
    )
    return r.rows[0] ? cargar(this.db, r.rows[0]) : null
  }
  async porUsuario(usuarioId: UniqueId): Promise<Matricula[]> {
    const r = await this.db.query(
      'SELECT * FROM enrollment.matriculas WHERE usuario_id = $1 ORDER BY created_at DESC',
      [usuarioId.valor],
    )
    return Promise.all(r.rows.map(f => cargar(this.db, f)))
  }
  async guardar(matricula: Matricula): Promise<void> {
    await this.db.query(
      `INSERT INTO enrollment.matriculas (id, usuario_id, curso_id, estado, origen, orden_id)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado, updated_at = now()`,
      [
        matricula.id.valor,
        matricula.usuarioId.valor,
        matricula.cursoId.valor,
        matricula.estado,
        matricula.origen,
        matricula.ordenId?.valor ?? null,
      ],
    )
    for (const [leccionId, tomoId] of matricula.leccionesCompletadas)
      await this.db.query(
        `INSERT INTO enrollment.progreso_lecciones (matricula_id, leccion_id, tomo_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [matricula.id.valor, leccionId, tomoId],
      )
    for (const tomoId of matricula.tomosCompletados)
      await this.db.query(
        `INSERT INTO enrollment.progreso_tomos (matricula_id, tomo_id, completado_at) VALUES ($1,$2,now()) ON CONFLICT (matricula_id,tomo_id) DO UPDATE SET completado_at = COALESCE(enrollment.progreso_tomos.completado_at, now())`,
        [matricula.id.valor, tomoId],
      )
  }
  async evaluacionAprobada(
    usuarioId: UniqueId,
    tomoId: string,
  ): Promise<{ aprobada: boolean; puntaje: number }> {
    const r = await this.db.query(
      'SELECT mejor_puntaje FROM enrollment.progreso_tomos pt JOIN enrollment.matriculas m ON m.id = pt.matricula_id WHERE m.usuario_id = $1 AND pt.tomo_id = $2 AND pt.completado_at IS NOT NULL ORDER BY mejor_puntaje DESC NULLS LAST LIMIT 1',
      [usuarioId.valor, tomoId],
    )
    return { aprobada: !!r.rows[0], puntaje: Number(r.rows[0]?.mejor_puntaje ?? 0) }
  }
  async cursosCompletadosDe(usuarioId: UniqueId): Promise<string[]> {
    const r = await this.db.query(
      'SELECT curso_id FROM enrollment.matriculas WHERE usuario_id = $1 AND curso_completado_at IS NOT NULL',
      [usuarioId.valor],
    )
    return r.rows.map(x => String(x.curso_id))
  }
  async marcarCursoCompletado(matriculaId: UniqueId, cursoId: string): Promise<void> {
    await this.db.query(
      'UPDATE enrollment.matriculas SET curso_completado_at = COALESCE(curso_completado_at, now()), updated_at = now() WHERE id = $1 AND curso_id = $2',
      [matriculaId.valor, cursoId],
    )
  }
  async cursoYaCompletado(matriculaId: UniqueId): Promise<boolean> {
    const r = await this.db.query(
      'SELECT 1 FROM enrollment.matriculas WHERE id = $1 AND curso_completado_at IS NOT NULL',
      [matriculaId.valor],
    )
    return !!r.rows[0]
  }
}
