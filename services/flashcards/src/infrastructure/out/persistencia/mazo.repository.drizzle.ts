import { UniqueId } from '@edtech/shared-kernel'
import {
  MazoFlashcards,
  type LeccionFuente,
  type Tarjeta,
} from '../../../domain/entities/mazo-flashcards.entity'
import type { MazoRepository } from '../../../domain/ports-out/mazo.repository'
import type { Db } from './db'

// eslint-disable-next-line -- la fila SQL es dinámica en el límite de persistencia
const cargar = async (db: Db, f: Record<string, any>): Promise<MazoFlashcards> => {
  const r = await db.query(
    'SELECT id,orden,anverso,reverso,estado,revisada_por,revisada_at,motivo_rechazo,editada FROM flashcards.tarjetas WHERE mazo_id=$1 ORDER BY orden',
    [f.id],
  )
  return MazoFlashcards.reconstruir({
    id: UniqueId.desde(String(f.id)),
    tomoId: String(f.tomo_id),
    cursoId: String(f.curso_id),
    version: Number(f.version),
    contenidoHash: String(f.contenido_hash),
    estado: String(f.estado),
    modeloUsado: f.modelo_usado ? String(f.modelo_usado) : null,
    generadoAt: f.generado_at ? new Date(f.generado_at) : null,
    publicadoAt: f.publicado_at ? new Date(f.publicado_at) : null,
    intentos: Number(f.intentos),
    leccionesFuente: (f.lecciones_fuente ?? []) as LeccionFuente[],
    tarjetas: r.rows.map(
      t =>
        ({
          id: String(t.id),
          orden: Number(t.orden),
          anverso: String(t.anverso),
          reverso: String(t.reverso),
          estado: String(t.estado),
          revisadaPor: t.revisada_por ? String(t.revisada_por) : null,
          revisadaAt: t.revisada_at ? new Date(t.revisada_at) : null,
          motivoRechazo: t.motivo_rechazo ? String(t.motivo_rechazo) : null,
          editada: Boolean(t.editada),
        }) as Tarjeta,
    ),
  } as never)
}
export class DrizzleMazoRepository implements MazoRepository {
  constructor(private readonly db: Db) {}
  async porId(id: UniqueId): Promise<MazoFlashcards | null> {
    const r = await this.db.query('SELECT * FROM flashcards.mazos WHERE id=$1', [id.valor])
    return r.rows[0] ? cargar(this.db, r.rows[0]) : null
  }
  async porTomoYHash(tomoId: string, hash: string): Promise<MazoFlashcards | null> {
    const r = await this.db.query(
      'SELECT * FROM flashcards.mazos WHERE tomo_id=$1 AND contenido_hash=$2 LIMIT 1',
      [tomoId, hash],
    )
    return r.rows[0] ? cargar(this.db, r.rows[0]) : null
  }
  async ultimaVersionDe(tomoId: string): Promise<number> {
    const r = await this.db.query(
      'SELECT COALESCE(MAX(version),0) AS version FROM flashcards.mazos WHERE tomo_id=$1',
      [tomoId],
    )
    return Number(r.rows[0]?.version ?? 0)
  }
  async porTomoParaAdmin(tomoId: string): Promise<MazoFlashcards[]> {
    const r = await this.db.query(
      'SELECT * FROM flashcards.mazos WHERE tomo_id=$1 ORDER BY version DESC',
      [tomoId],
    )
    return Promise.all(r.rows.map(x => cargar(this.db, x)))
  }
  async porTomoParaEstudiante(tomoId: string): Promise<Tarjeta[]> {
    const r = await this.db.query(
      `SELECT t.id,t.orden,t.anverso,t.reverso,t.estado,t.revisada_por,t.revisada_at,t.motivo_rechazo,t.editada FROM flashcards.tarjetas t JOIN flashcards.mazos m ON m.id=t.mazo_id WHERE m.tomo_id=$1 AND m.estado='PUBLICADO' AND t.estado='PUBLICADA' ORDER BY m.version DESC,t.orden`,
      [tomoId],
    )
    return r.rows.map(t => ({
      id: String(t.id),
      orden: Number(t.orden),
      anverso: String(t.anverso),
      reverso: String(t.reverso),
      estado: 'PUBLICADA',
      revisadaPor: t.revisada_por ? String(t.revisada_por) : null,
      revisadaAt: t.revisada_at ? new Date(t.revisada_at) : null,
      motivoRechazo: null,
      editada: Boolean(t.editada),
    }))
  }
  async guardar(m: MazoFlashcards): Promise<void> {
    await this.db.query(
      `INSERT INTO flashcards.mazos (id,tomo_id,curso_id,version,contenido_hash,estado,modelo_usado,intentos,lecciones_fuente,generado_at,publicado_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET estado=EXCLUDED.estado,modelo_usado=EXCLUDED.modelo_usado,intentos=EXCLUDED.intentos,lecciones_fuente=EXCLUDED.lecciones_fuente,generado_at=EXCLUDED.generado_at,publicado_at=EXCLUDED.publicado_at`,
      [
        m.id.valor,
        m.tomoId,
        m.cursoId,
        m.version,
        m.contenidoHash,
        m.estado,
        m.modeloUsado,
        m.intentos,
        JSON.stringify(m.leccionesFuente),
        m.generadoAt,
        m.publicadoAt,
      ],
    )
    await this.db.query('DELETE FROM flashcards.tarjetas WHERE mazo_id=$1', [m.id.valor])
    for (const t of m.tarjetas)
      await this.db.query(
        `INSERT INTO flashcards.tarjetas (id,mazo_id,orden,anverso,reverso,estado,revisada_por,revisada_at,motivo_rechazo,editada) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          t.id,
          m.id.valor,
          t.orden,
          t.anverso,
          t.reverso,
          t.estado,
          t.revisadaPor,
          t.revisadaAt,
          t.motivoRechazo,
          t.editada,
        ],
      )
  }
}
