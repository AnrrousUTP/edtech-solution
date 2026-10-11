import { UniqueId } from '@edtech/shared-kernel'
import { Certificado } from '../../../domain/entities/certificado.entity'
import {
  PerfilGamificacion,
  type CriterioInsignia,
} from '../../../domain/entities/perfil-gamificacion.entity'
import { CodigoVerificacion } from '../../../domain/value-objects/codigo-verificacion.vo'
import type { CertificadoRepository } from '../../../domain/ports-out/certificado.repository'
import type { PerfilRepository } from '../../../domain/ports-out/perfil.repository'
import type { Db } from './db'

export class DrizzlePerfilRepository implements PerfilRepository {
  constructor(private readonly db: Db) {}
  async porUsuario(usuarioId: UniqueId): Promise<PerfilGamificacion | null> {
    const r = await this.db.query('SELECT * FROM gamification.perfiles WHERE usuario_id = $1', [
      usuarioId.valor,
    ])
    if (!r.rows[0]) return null
    const insignias = await this.db.query(
      'SELECT criterio, referencia_id, otorgada_at FROM gamification.insignias_otorgadas WHERE usuario_id = $1',
      [usuarioId.valor],
    )
    const mapa = new Map<
      string,
      { criterio: CriterioInsignia; referenciaId: string; otorgadaAt: Date }
    >()
    for (const i of insignias.rows)
      mapa.set(`${i.criterio}|${i.referencia_id}`, {
        criterio: i.criterio as CriterioInsignia,
        referenciaId: String(i.referencia_id),
        otorgadaAt: new Date(i.otorgada_at),
      })
    return PerfilGamificacion.reconstruir({
      usuarioId,
      nombreTitular: r.rows[0].nombre_titular ? String(r.rows[0].nombre_titular) : null,
      puntos: Number(r.rows[0].puntos),
      rachaActual: Number(r.rows[0].racha_actual),
      rachaMaxima: Number(r.rows[0].racha_maxima),
      ultimaActividad: r.rows[0].ultima_actividad ? new Date(r.rows[0].ultima_actividad) : null,
      zonaHoraria: String(r.rows[0].zona_horaria),
      insignias: mapa,
    } as never)
  }
  async todos(): Promise<PerfilGamificacion[]> {
    const perfiles = await this.db.query(
      'SELECT * FROM gamification.perfiles ORDER BY puntos DESC, updated_at DESC',
    )
    const insignias = await this.db.query(
      'SELECT usuario_id, criterio, referencia_id, otorgada_at FROM gamification.insignias_otorgadas ORDER BY otorgada_at DESC',
    )
    const porUsuario = new Map<
      string,
      Map<string, { criterio: CriterioInsignia; referenciaId: string; otorgadaAt: Date }>
    >()
    for (const i of insignias.rows) {
      const mapa = porUsuario.get(String(i.usuario_id)) ?? new Map()
      mapa.set(`${i.criterio}|${i.referencia_id}`, {
        criterio: i.criterio as CriterioInsignia,
        referenciaId: String(i.referencia_id),
        otorgadaAt: new Date(i.otorgada_at),
      })
      porUsuario.set(String(i.usuario_id), mapa)
    }
    return perfiles.rows.map(fila =>
      PerfilGamificacion.reconstruir({
        usuarioId: UniqueId.desde(String(fila.usuario_id)),
        nombreTitular: fila.nombre_titular ? String(fila.nombre_titular) : null,
        puntos: Number(fila.puntos),
        rachaActual: Number(fila.racha_actual),
        rachaMaxima: Number(fila.racha_maxima),
        ultimaActividad: fila.ultima_actividad ? new Date(fila.ultima_actividad) : null,
        zonaHoraria: String(fila.zona_horaria),
        insignias: porUsuario.get(String(fila.usuario_id)) ?? new Map(),
      } as never),
    )
  }
  async guardar(perfil: PerfilGamificacion): Promise<void> {
    await this.db.query(
      `INSERT INTO gamification.perfiles (usuario_id,nombre_titular,puntos,racha_actual,racha_maxima,ultima_actividad,zona_horaria)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (usuario_id) DO UPDATE SET nombre_titular=COALESCE(EXCLUDED.nombre_titular,gamification.perfiles.nombre_titular),puntos=EXCLUDED.puntos,racha_actual=EXCLUDED.racha_actual,
      racha_maxima=EXCLUDED.racha_maxima,ultima_actividad=EXCLUDED.ultima_actividad,zona_horaria=EXCLUDED.zona_horaria,updated_at=now()`,
      [
        perfil.usuarioId.valor,
        perfil.nombreTitular,
        perfil.puntos,
        perfil.rachaActual,
        perfil.rachaMaxima,
        perfil.ultimaActividad,
        perfil.zonaHoraria,
      ],
    )
    for (const i of perfil.insignias)
      await this.db.query(
        `INSERT INTO gamification.insignias_otorgadas (usuario_id,criterio,referencia_id,otorgada_at)
      VALUES ($1,$2,$3,$4) ON CONFLICT (usuario_id,criterio,referencia_id) DO NOTHING`,
        [perfil.usuarioId.valor, i.criterio, i.referenciaId, i.otorgadaAt],
      )
  }
}

// eslint-disable-next-line -- la fila SQL es dinámica en el límite de persistencia
const cargarCertificado = (fila: Record<string, any>): Certificado | null => {
  const codigo = CodigoVerificacion.crear(String(fila.codigo_verificacion))
  if (!codigo.ok) return null
  return Certificado.reconstruir({
    id: UniqueId.desde(String(fila.id)),
    usuarioId: UniqueId.desde(String(fila.usuario_id)),
    tipo: String(fila.tipo) as 'MENOR' | 'MAYOR',
    referenciaId: String(fila.referencia_id),
    titulo: String(fila.titulo),
    nombreTitular: String(fila.nombre_titular),
    codigo: codigo.value,
    pdfS3Key: fila.pdf_s3_key ? String(fila.pdf_s3_key) : null,
    emitidoAt: new Date(fila.emitido_at),
  } as never)
}

export class DrizzleCertificadoRepository implements CertificadoRepository {
  constructor(private readonly db: Db) {}
  async porId(id: UniqueId): Promise<Certificado | null> {
    const r = await this.db.query('SELECT * FROM gamification.certificados WHERE id = $1', [
      id.valor,
    ])
    return r.rows[0] ? cargarCertificado(r.rows[0]) : null
  }
  async porCodigo(codigo: string): Promise<Certificado | null> {
    const r = await this.db.query(
      'SELECT * FROM gamification.certificados WHERE codigo_verificacion = $1',
      [codigo],
    )
    return r.rows[0] ? cargarCertificado(r.rows[0]) : null
  }
  async porReferencia(
    usuarioId: UniqueId,
    tipo: 'MENOR' | 'MAYOR',
    referenciaId: string,
  ): Promise<Certificado | null> {
    const r = await this.db.query(
      'SELECT * FROM gamification.certificados WHERE usuario_id=$1 AND tipo=$2 AND referencia_id=$3',
      [usuarioId.valor, tipo, referenciaId],
    )
    return r.rows[0] ? cargarCertificado(r.rows[0]) : null
  }
  async porUsuario(usuarioId: UniqueId): Promise<Certificado[]> {
    const r = await this.db.query(
      'SELECT * FROM gamification.certificados WHERE usuario_id=$1 ORDER BY emitido_at DESC',
      [usuarioId.valor],
    )
    return r.rows.map(cargarCertificado).filter((c): c is Certificado => c !== null)
  }
  async guardar(certificado: Certificado): Promise<void> {
    await this.db.query(
      `INSERT INTO gamification.certificados (id,usuario_id,tipo,referencia_id,titulo,nombre_titular,codigo_verificacion,pdf_s3_key,emitido_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET pdf_s3_key=EXCLUDED.pdf_s3_key`,
      [
        certificado.id.valor,
        certificado.usuarioId.valor,
        certificado.tipo,
        certificado.referenciaId,
        certificado.titulo,
        certificado.nombreTitular,
        certificado.codigo.valor,
        certificado.pdfS3Key,
        certificado.emitidoAt,
      ],
    )
  }
}
