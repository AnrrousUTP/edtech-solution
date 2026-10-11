import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import type pg from 'pg'
import { timingSafeEqual } from 'node:crypto'
import type { SobreEvento } from '@edtech/shared-kernel'
import type { TerminalRepository } from '../../../domain/ports-out/terminal.repository'
import type { Terminal, TerminalConfig } from '../../../domain/entities/terminal.entity'
import { TerminalError } from '../../../domain/module.errors'
export class RepositorioTerminales implements TerminalRepository {
  readonly db
  constructor(
    pool: pg.Pool,
    private readonly deviceId: string,
    private readonly offlineMs: number,
  ) {
    this.db = drizzle(pool)
  }
  private terminal(r: Record<string, unknown>): Terminal {
    const at = r.ultima_conexion ? new Date(String(r.ultima_conexion)).toISOString() : null
    return {
      id: String(r.id),
      usuarioId: r.usuario_id ? String(r.usuario_id) : null,
      refId: r.ref_id ? String(r.ref_id) : null,
      mensaje: String(r.mensaje),
      habilitado: Boolean(r.habilitado),
      version: Number(r.version),
      versionReportada: Number(r.version_reportada),
      ultimaConexion: at,
      conectado: at !== null && Date.now() - Date.parse(at) < this.offlineMs,
      ultimoAviso: r.ultimo_aviso ? String(r.ultimo_aviso) : null,
      previewToken: String(r.preview_token),
    }
  }
  async solicitar(usuarioId: string): Promise<void> {
    const a = await this.db.execute(
      sql`SELECT 1 FROM iot_terminals.affiliate_projection WHERE usuario_id=${usuarioId}`,
    )
    if (!a.rows.length)
      throw new TerminalError(
        'AFILIADO_NO_LISTO',
        'Activa el programa de afiliados y espera unos segundos',
        409,
      )
    await this.db.execute(
      sql`INSERT INTO iot_terminals.terminal_requests(usuario_id) VALUES (${usuarioId}) ON CONFLICT DO NOTHING`,
    )
  }
  async mio(usuarioId: string): Promise<{ terminal: Terminal | null; solicitud: string | null }> {
    const [t, r] = await Promise.all([
      this.db.execute(sql`SELECT * FROM iot_terminals.terminals WHERE usuario_id=${usuarioId}`),
      this.db.execute(
        sql`SELECT 1 FROM iot_terminals.terminal_requests WHERE usuario_id=${usuarioId}`,
      ),
    ])
    return {
      terminal: t.rows[0] ? this.terminal(t.rows[0]) : null,
      solicitud: t.rows.length ? 'ASIGNADA' : r.rows.length ? 'SOLICITADA' : null,
    }
  }
  async configurar(
    usuarioId: string,
    mensaje: string,
    habilitado: boolean,
    version: number,
  ): Promise<void> {
    const r = await this.db
      .execute(sql`UPDATE iot_terminals.terminals SET mensaje=${mensaje},habilitado=${habilitado},version=version+1
      WHERE usuario_id=${usuarioId} AND version=${version} RETURNING id`)
    if (!r.rows.length)
      throw new TerminalError(
        'CONFIGURACION_CONFLICTO',
        'El terminal no está asignado o su configuración cambió; actualiza la página',
        409,
      )
  }
  async asignar(usuarioId: string | null): Promise<void> {
    await this.db.transaction(async tx => {
      const a = usuarioId
        ? (
            await tx.execute(
              sql`SELECT * FROM iot_terminals.affiliate_projection WHERE usuario_id=${usuarioId}`,
            )
          ).rows[0]
        : null
      if (usuarioId && !a)
        throw new TerminalError(
          'AFILIADO_NO_LISTO',
          'El afiliado aún no está registrado en terminales',
          409,
        )
      await tx.execute(sql`UPDATE iot_terminals.terminals SET usuario_id=${usuarioId},ref_id=${a?.ref_id ?? null},habilitado=${usuarioId !== null},
        version=version+1,preview_token=encode(gen_random_bytes(24),'hex'),ultimo_aviso=NULL WHERE id=${this.deviceId}`)
      await tx.execute(
        sql`UPDATE iot_terminals.terminal_alerts SET ack_at=now() WHERE terminal_id=${this.deviceId} AND ack_at IS NULL`,
      )
    })
  }
  async admin(): Promise<Record<string, unknown>> {
    const [t, a] = await Promise.all([
      this.db.execute(sql`SELECT * FROM iot_terminals.terminals ORDER BY id`),
      this.db.execute(
        sql`SELECT a.usuario_id AS "usuarioId",a.ref_id AS "refId",r.creado_at AS "solicitadoAt" FROM iot_terminals.affiliate_projection a LEFT JOIN iot_terminals.terminal_requests r ON r.usuario_id=a.usuario_id ORDER BY r.creado_at NULLS LAST`,
      ),
    ])
    return { terminales: t.rows.map(r => this.terminal(r)), afiliados: a.rows }
  }
  async vista(id: string, token: string) {
    const r = (await this.db.execute(sql`SELECT * FROM iot_terminals.terminals WHERE id=${id}`))
      .rows[0]
    const stored = String(r?.preview_token ?? '')
    if (
      !r ||
      !/^[a-f0-9]{48}$/.test(token) ||
      token.length !== stored.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(stored))
    )
      throw new TerminalError('VISTA_NO_DISPONIBLE', 'La vista no está disponible', 404)
    const {
      usuarioId: _usuario,
      previewToken: _token,
      ultimaConexion: _at,
      ...publico
    } = this.terminal(r)
    return publico
  }
  async configuracion(): Promise<TerminalConfig> {
    const r = (
      await this.db.execute(sql`SELECT * FROM iot_terminals.terminals WHERE id=${this.deviceId}`)
    ).rows[0]!
    return {
      version: Number(r.version),
      refId: r.ref_id ? String(r.ref_id) : null,
      mensaje: String(r.mensaje),
      habilitado: Boolean(r.habilitado),
    }
  }
  async alertas(): Promise<{ id: string; texto: string }[]> {
    const r = await this.db
      .execute(sql`SELECT a.id,a.texto FROM iot_terminals.terminal_alerts a JOIN iot_terminals.terminals t ON t.id=a.terminal_id
      WHERE a.terminal_id=${this.deviceId} AND t.habilitado=true AND a.ack_at IS NULL AND a.creado_at>now()-interval '1 hour' ORDER BY a.creado_at LIMIT 20`)
    return r.rows.map(a => ({ id: String(a.id), texto: String(a.texto) }))
  }
  async procesar(sobre: SobreEvento): Promise<void> {
    await this.db.transaction(async tx => {
      const claim = await tx.execute(
        sql`INSERT INTO iot_terminals.processed_events(event_id,event_type) VALUES (${sobre.eventId},${sobre.eventType}) ON CONFLICT DO NOTHING RETURNING event_id`,
      )
      if (!claim.rows.length) return
      const p = sobre.payload
      if (sobre.eventType === 'affiliates.afiliado-activado.v1') {
        await tx.execute(
          sql`INSERT INTO iot_terminals.affiliate_projection(usuario_id,afiliado_id,ref_id) VALUES (${p.usuarioId},${p.afiliadoId},${p.refId}) ON CONFLICT(usuario_id) DO NOTHING`,
        )
      } else if (sobre.eventType === 'affiliates.comision-registrada.v1') {
        const t = (
          await tx.execute(
            sql`SELECT id FROM iot_terminals.terminals WHERE usuario_id=${p.usuarioId} AND habilitado=true`,
          )
        ).rows[0]
        if (t)
          await tx.execute(
            sql`INSERT INTO iot_terminals.terminal_alerts(id,terminal_id,orden_id,texto) VALUES (${sobre.eventId},${t.id},${p.ordenId},'Nueva venta confirmada') ON CONFLICT DO NOTHING`,
          )
      } else if (sobre.eventType === 'iot.telemetry.interno') {
        await tx.execute(sql`UPDATE iot_terminals.terminals SET ultima_conexion=now(),version_reportada=greatest(version_reportada,${p.version})
          WHERE id=${this.deviceId} AND ${p.version}<=version`)
        if (typeof p.alertId === 'string') {
          const a = (
            await tx.execute(
              sql`UPDATE iot_terminals.terminal_alerts SET ack_at=coalesce(ack_at,now()) WHERE id=${p.alertId} AND terminal_id=${this.deviceId} RETURNING texto`,
            )
          ).rows[0]
          if (a)
            await tx.execute(
              sql`UPDATE iot_terminals.terminals SET ultimo_aviso=${a.texto} WHERE id=${this.deviceId}`,
            )
        }
      }
    })
  }
}
