import { sql, type SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import type pg from 'pg'
import type { SobreEvento } from '@edtech/shared-kernel'
import type { Afiliado, Atribucion, VentaReferida } from '../../../domain/entities/afiliado.entity'
import { AfiliacionError } from '../../../domain/module.errors'
import type { AfiliadosRepository } from '../../../domain/ports-out/afiliados.repository'
import { calcularComision, ingresoNeto } from '../../../domain/value-objects/comision.vo'

type Executor = { execute(query: SQL): Promise<{ rows: Record<string, unknown>[] }> }
const afiliadoDe = (r: Record<string, unknown>): Afiliado => ({
  id: String(r.id),
  usuarioId: String(r.usuario_id),
  refId: String(r.ref_id),
  activo: Boolean(r.activo),
  cursoSlug: r.curso_slug ? String(r.curso_slug) : null,
  creadoAt: new Date(String(r.creado_at)).toISOString(),
})
const agregarEvento = async (
  tx: Executor,
  tipo: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> => {
  await tx.execute(sql`INSERT INTO affiliates.outbox(event_id,event_type,aggregate_id,payload)
    VALUES (${crypto.randomUUID()},${tipo},${id},${JSON.stringify(payload)}::jsonb)`)
}

export class RepositorioAfiliados implements AfiliadosRepository {
  readonly db
  constructor(pool: pg.Pool) {
    this.db = drizzle(pool)
  }
  async activar(usuarioId: string): Promise<Afiliado> {
    return this.db.transaction(async tx => {
      const nuevo = await tx.execute(
        sql`INSERT INTO affiliates.affiliates(usuario_id) VALUES (${usuarioId}) ON CONFLICT(usuario_id) DO NOTHING RETURNING *`,
      )
      const r =
        nuevo.rows[0] ??
        (await tx.execute(sql`SELECT * FROM affiliates.affiliates WHERE usuario_id=${usuarioId}`))
          .rows[0]!
      const a = afiliadoDe(r)
      if (nuevo.rows.length)
        await agregarEvento(tx, 'affiliates.afiliado-activado.v1', a.id, {
          afiliadoId: a.id,
          usuarioId: a.usuarioId,
          refId: a.refId,
        })
      return a
    })
  }
  async porUsuario(usuarioId: string): Promise<Afiliado | null> {
    const r = await this.db.execute(
      sql`SELECT * FROM affiliates.affiliates WHERE usuario_id=${usuarioId}`,
    )
    return r.rows[0] ? afiliadoDe(r.rows[0]) : null
  }
  async visitar(refId: string, anterior?: string): Promise<{ visitaId: string; destino: string }> {
    return this.db.transaction(async tx => {
      const a = (
        await tx.execute(
          sql`SELECT * FROM affiliates.affiliates WHERE ref_id=${refId} AND activo=true`,
        )
      ).rows[0]
      if (!a) throw new AfiliacionError('REFERIDO_INVALIDO', 'Este enlace no está activo', 404)
      const previa = anterior
        ? (
            await tx.execute(
              sql`SELECT id FROM affiliates.referral_visits WHERE id=${anterior} AND afiliado_id=${a.id} AND usuario_id IS NULL AND creado_at>now()-interval '30 minutes'`,
            )
          ).rows[0]
        : null
      const v =
        previa ??
        (
          await tx.execute(
            sql`INSERT INTO affiliates.referral_visits(afiliado_id) VALUES (${a.id}) RETURNING id`,
          )
        ).rows[0]!
      return {
        visitaId: String(v.id),
        destino: a.curso_slug ? `/cursos/${encodeURIComponent(String(a.curso_slug))}` : '/cursos',
      }
    })
  }
  async atribuir(usuarioId: string, visitaId?: string): Promise<Atribucion | null> {
    return this.db.transaction(async tx => {
      if (visitaId) {
        const visita = (
          await tx.execute(sql`UPDATE affiliates.referral_visits v SET usuario_id=${usuarioId}
          FROM affiliates.affiliates a WHERE v.id=${visitaId} AND v.afiliado_id=a.id AND a.activo=true
          AND a.usuario_id<>${usuarioId} AND (v.usuario_id IS NULL OR v.usuario_id=${usuarioId}) AND v.expira_at>now()
          RETURNING v.id,v.creado_at`)
        ).rows[0]
        if (visita)
          await tx.execute(sql`INSERT INTO affiliates.buyer_attributions(usuario_id,visita_id,actualizado_at)
          VALUES (${usuarioId},${visita.id},${visita.creado_at}) ON CONFLICT(usuario_id) DO UPDATE SET visita_id=EXCLUDED.visita_id,actualizado_at=EXCLUDED.actualizado_at
          WHERE affiliates.buyer_attributions.actualizado_at<=EXCLUDED.actualizado_at`)
      }
      const r = (
        await tx.execute(sql`SELECT a.id,a.usuario_id,a.ref_id,v.id AS visita_id FROM affiliates.buyer_attributions b
        JOIN affiliates.referral_visits v ON v.id=b.visita_id JOIN affiliates.affiliates a ON a.id=v.afiliado_id
        WHERE b.usuario_id=${usuarioId} AND a.usuario_id<>${usuarioId} AND a.activo=true AND v.expira_at>now()`)
      ).rows[0]
      return r
        ? {
            afiliadoId: String(r.id),
            afiliadoUsuarioId: String(r.usuario_id),
            visitaId: String(r.visita_id),
            refId: String(r.ref_id),
            compradorId: usuarioId,
            politica: 'ultimo-referido-30d-v1',
            tasaBps: 500,
          }
        : null
    })
  }
  async configurar(usuarioId: string, cursoSlug: string | null): Promise<void> {
    if (cursoSlug) {
      const c = await this.db.execute(
        sql`SELECT 1 FROM affiliates.course_projection WHERE slug=${cursoSlug} AND publicado=true`,
      )
      if (!c.rows.length)
        throw new AfiliacionError('CURSO_INVALIDO', 'Elige un curso publicado', 404)
    }
    const r = await this.db.execute(
      sql`UPDATE affiliates.affiliates SET curso_slug=${cursoSlug} WHERE usuario_id=${usuarioId} AND activo=true RETURNING id`,
    )
    if (!r.rows.length)
      throw new AfiliacionError(
        'AFILIADO_INACTIVO',
        'Activa el programa antes de configurar tu enlace',
        409,
      )
  }
  async resumen(
    usuarioId: string,
    desde?: string,
    hasta?: string,
    cursor?: string,
  ): Promise<Record<string, unknown>> {
    const a = await this.porUsuario(usuarioId)
    if (!a)
      throw new AfiliacionError('NO_AFILIADO', 'Activa tu participación para ver tus ingresos', 404)
    const filtros = sql`afiliado_id=${a.id} AND (${desde ?? null}::timestamptz IS NULL OR creado_at>=${desde ?? null}::timestamptz)
      AND (${hasta ?? null}::timestamptz IS NULL OR creado_at<${hasta ?? null}::timestamptz+interval '1 day')`
    const [totales, periodo, visitas, cursos, filas] = await Promise.all([
      this.db.execute(
        sql`SELECT coalesce(sum(neto_centavos),0) AS total FROM affiliates.commissions WHERE afiliado_id=${a.id}`,
      ),
      this.db.execute(
        sql`SELECT count(*) AS ventas,coalesce(sum(neto_centavos),0) AS ingresos FROM affiliates.commissions WHERE ${filtros}`,
      ),
      this.db.execute(
        sql`SELECT count(*) AS visitas FROM affiliates.referral_visits WHERE ${filtros}`,
      ),
      this.db.execute(
        sql`SELECT curso_id AS id,titulo,slug FROM affiliates.course_projection WHERE publicado=true ORDER BY titulo`,
      ),
      this.db.execute(sql`SELECT * FROM affiliates.commissions WHERE ${filtros}
        AND (${cursor ?? null}::uuid IS NULL OR (creado_at,id)<(SELECT creado_at,id FROM affiliates.commissions WHERE id=${cursor ?? null}::uuid AND afiliado_id=${a.id}))
        ORDER BY creado_at DESC,id DESC LIMIT 51`),
    ])
    const history = filas.rows.slice(0, 50).map(r => ({
      id: String(r.id),
      ordenId: String(r.orden_id),
      cursoTitulo: String(r.curso_titulo),
      baseCentavos: Number(r.base_centavos),
      tasaBps: Number(r.tasa_bps),
      originalCentavos: Number(r.original_centavos),
      ingresoCentavos: Number(r.neto_centavos),
      estado:
        Number(r.neto_centavos) === 0
          ? 'ANULADA'
          : Number(r.neto_centavos) < Number(r.original_centavos)
            ? 'AJUSTADA'
            : 'REGISTRADA',
      creadoAt: new Date(String(r.creado_at)).toISOString(),
    }))
    return {
      afiliado: a,
      moneda: 'USD',
      totalCentavos: Number(totales.rows[0]?.total ?? 0),
      ingresosPeriodoCentavos: Number(periodo.rows[0]?.ingresos ?? 0),
      ventas: Number(periodo.rows[0]?.ventas ?? 0),
      visitas: Number(visitas.rows[0]?.visitas ?? 0),
      cursos: cursos.rows,
      historial: history,
      siguienteCursor: filas.rows.length > 50 ? (history.at(-1)?.id ?? null) : null,
    }
  }
  async notificaciones(usuarioId: string): Promise<Record<string, unknown>[]> {
    return (
      await this.db.execute(
        sql`SELECT id,mensaje,leida,creado_at AS "creadoAt" FROM affiliates.notifications WHERE usuario_id=${usuarioId} ORDER BY creado_at DESC LIMIT 100`,
      )
    ).rows
  }
  async leerNotificacion(usuarioId: string, id: string): Promise<boolean> {
    return (
      (
        await this.db.execute(
          sql`UPDATE affiliates.notifications SET leida=true WHERE id=${id} AND usuario_id=${usuarioId} RETURNING id`,
        )
      ).rows.length > 0
    )
  }
  async admin(): Promise<Record<string, unknown>> {
    const [a, c] = await Promise.all([
      this.db.execute(
        sql`SELECT a.*,coalesce(sum(c.neto_centavos),0)::float8 AS "ingresosCentavos",count(c.id)::int AS ventas FROM affiliates.affiliates a LEFT JOIN affiliates.commissions c ON c.afiliado_id=a.id GROUP BY a.id ORDER BY a.creado_at DESC LIMIT 100`,
      ),
      this.db.execute(
        sql`SELECT c.id,c.orden_id AS "ordenId",a.ref_id AS "refId",c.curso_titulo AS "cursoTitulo",c.neto_centavos::float8 AS "ingresoCentavos",c.base_centavos::float8 AS "baseCentavos",c.creado_at AS "creadoAt" FROM affiliates.commissions c JOIN affiliates.affiliates a ON a.id=c.afiliado_id ORDER BY c.creado_at DESC LIMIT 100`,
      ),
    ])
    return {
      afiliados: a.rows.map(r => ({
        ...afiliadoDe(r),
        ingresosCentavos: Number(r.ingresosCentavos),
        ventas: Number(r.ventas),
      })),
      comisiones: c.rows,
    }
  }
  async estadoAfiliado(id: string, activo: boolean): Promise<void> {
    const r = await this.db.execute(
      sql`UPDATE affiliates.affiliates SET activo=${activo} WHERE id=${id} RETURNING id`,
    )
    if (!r.rows.length) throw new AfiliacionError('NO_AFILIADO', 'No existe el afiliado', 404)
  }
  async procesar(sobre: SobreEvento): Promise<void> {
    await this.db.transaction(async tx => {
      const claim = await tx.execute(
        sql`INSERT INTO affiliates.processed_events(event_id,event_type) VALUES (${sobre.eventId},${sobre.eventType}) ON CONFLICT DO NOTHING RETURNING event_id`,
      )
      if (!claim.rows.length) return
      const p = sobre.payload
      if (sobre.eventType === 'catalog.curso-publicado.v1') {
        await tx.execute(sql`INSERT INTO affiliates.course_projection(curso_id,titulo,slug,publicado) VALUES (${p.cursoId},${p.titulo},${p.slug},true)
          ON CONFLICT(curso_id) DO UPDATE SET titulo=EXCLUDED.titulo,slug=EXCLUDED.slug,publicado=true`)
        return
      }
      if (sobre.eventType === 'catalog.curso-despublicado.v1') {
        await tx.execute(
          sql`UPDATE affiliates.course_projection SET publicado=false WHERE curso_id=${p.cursoId}`,
        )
        return
      }
      if (
        !['payments.venta-referida-confirmada.v1', 'payments.pago-reembolsado.v1'].includes(
          sobre.eventType,
        )
      )
        return
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${String(p.ordenId)}))`)
      if (sobre.eventType === 'payments.venta-referida-confirmada.v1') {
        const v = p as unknown as VentaReferida
        const a = (
          await tx.execute(
            sql`SELECT * FROM affiliates.affiliates WHERE id=${v.afiliadoId} AND usuario_id=${v.afiliadoUsuarioId}`,
          )
        ).rows[0]
        if (!a || v.compradorId === v.afiliadoUsuarioId)
          throw new Error('Venta referida sin afiliado válido')
        const importe = calcularComision(v.baseCentavos, v.tasaBps)
        const nuevo =
          await tx.execute(sql`INSERT INTO affiliates.commissions(orden_id,afiliado_id,curso_id,curso_titulo,base_centavos,tasa_bps,original_centavos,neto_centavos,moneda,politica,creado_at)
          VALUES (${v.ordenId},${v.afiliadoId},${v.cursoId},${v.cursoTitulo},${v.baseCentavos},500,${importe},${importe},'USD',${v.politica},${v.confirmadoAt}::timestamptz) ON CONFLICT(orden_id) DO NOTHING RETURNING id`)
        if (!nuevo.rows.length) return
        await tx.execute(
          sql`INSERT INTO affiliates.commission_movements(orden_id,referencia,centavos,tipo) VALUES (${v.ordenId},${`venta:${v.ordenId}`},${importe},'VENTA')`,
        )
        await tx.execute(
          sql`INSERT INTO affiliates.notifications(usuario_id,orden_id,referencia,mensaje) VALUES (${v.afiliadoUsuarioId},${v.ordenId},${`venta:${v.ordenId}`},${`¡Nueva venta! Obtuviste USD ${(importe / 100).toFixed(2)} de comisión por ${v.cursoTitulo}.`})`,
        )
        await agregarEvento(tx, 'affiliates.comision-registrada.v1', v.ordenId, {
          afiliadoId: v.afiliadoId,
          usuarioId: v.afiliadoUsuarioId,
          refId: v.refId,
          ordenId: v.ordenId,
          comisionCentavos: importe,
        })
      } else {
        const centavos = Math.round(Number(p.monto) * 100)
        if (!Number.isSafeInteger(centavos) || centavos < 0) throw new Error('Reembolso inválido')
        const insertado = await tx.execute(
          sql`INSERT INTO affiliates.refunds(reembolso_id,orden_id,centavos) VALUES (${String(p.reembolsoId)},${p.ordenId},${centavos}) ON CONFLICT DO NOTHING RETURNING reembolso_id`,
        )
        if (!insertado.rows.length) return
      }
      const c = (
        await tx.execute(sql`SELECT * FROM affiliates.commissions WHERE orden_id=${p.ordenId}`)
      ).rows[0]
      if (!c) return
      const total = (
        await tx.execute(
          sql`SELECT coalesce(sum(centavos),0) AS total FROM affiliates.refunds WHERE orden_id=${p.ordenId}`,
        )
      ).rows[0]!
      const neto = ingresoNeto(Number(c.base_centavos), Number(total.total))
      const delta = neto - Number(c.neto_centavos)
      if (delta !== 0) {
        await tx.execute(
          sql`UPDATE affiliates.commissions SET neto_centavos=${neto} WHERE id=${c.id}`,
        )
        await tx.execute(
          sql`INSERT INTO affiliates.commission_movements(orden_id,referencia,centavos,tipo) VALUES (${p.ordenId},${`ajuste:${sobre.eventId}`},${delta},'REEMBOLSO')`,
        )
        const propietario = (
          await tx.execute(
            sql`SELECT usuario_id FROM affiliates.affiliates WHERE id=${c.afiliado_id}`,
          )
        ).rows[0]!
        await tx.execute(
          sql`INSERT INTO affiliates.notifications(usuario_id,orden_id,referencia,mensaje) VALUES (${propietario.usuario_id},${p.ordenId},${`ajuste:${sobre.eventId}`},${`Ingreso ajustado por reembolso: USD ${(delta / 100).toFixed(2)}.`})`,
        )
      }
    })
  }
}
