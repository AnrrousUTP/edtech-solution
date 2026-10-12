import { UniqueId } from '@edtech/shared-kernel'
import { Orden } from '../../../domain/entities/orden.entity'
import type {
  OrdenRepository,
  PrecioProyeccionRepository,
  PrecioProyectado,
  WebhookCrudo,
  WebhookRepository,
  ColaWebhooks,
} from '../../../domain/ports-out/orden.repository'
import { Dinero } from '../../../domain/value-objects/dinero.vo'
import type { Db } from './db'

const dinero = (monto: unknown, moneda: string): Dinero =>
  Dinero.desdeCentavos(Math.round(Number(monto) * 100), moneda)
// eslint-disable-next-line -- la fila SQL es dinámica en el límite de persistencia
const cargarOrden = (r: Record<string, any>): Orden =>
  Orden.reconstruir({
    id: UniqueId.desde(String(r.id)),
    usuarioId: UniqueId.desde(String(r.usuario_id)),
    cursoId: UniqueId.desde(String(r.curso_id)),
    monto: dinero(r.monto, String(r.moneda).trim()),
    versionPrecio: Number(r.version_precio),
    estado: String(r.estado),
    paypalOrderId: r.paypal_order_id ? String(r.paypal_order_id) : null,
    paypalCaptureId: r.paypal_capture_id ? String(r.paypal_capture_id) : null,
    comision: r.comision === null ? null : dinero(r.comision, String(r.moneda).trim()),
    neto: r.neto === null ? null : dinero(r.neto, String(r.moneda).trim()),
    expiraAt: new Date(r.expira_at),
    createdAt: new Date(r.created_at),
    atribucion: r.atribucion ?? null,
    cursoTitulo: String(r.curso_titulo ?? ''),
    reembolsos: r.reembolsos_registrados ?? [],
  } as never)

export class DrizzleOrdenRepository implements OrdenRepository {
  constructor(private readonly db: Db) {}
  async porId(id: UniqueId): Promise<Orden | null> {
    const r = await this.db.query('SELECT * FROM payments.ordenes WHERE id=$1', [id.valor])
    return r.rows[0] ? cargarOrden(r.rows[0]) : null
  }
  async porPaypalOrderId(id: string): Promise<Orden | null> {
    const r = await this.db.query('SELECT * FROM payments.ordenes WHERE paypal_order_id=$1', [id])
    return r.rows[0] ? cargarOrden(r.rows[0]) : null
  }
  async porPaypalCaptureId(id: string): Promise<Orden | null> {
    if (!id) return null
    const r = await this.db.query('SELECT * FROM payments.ordenes WHERE paypal_capture_id=$1', [id])
    return r.rows[0] ? cargarOrden(r.rows[0]) : null
  }
  async pendienteDe(usuarioId: UniqueId, cursoId: UniqueId): Promise<Orden | null> {
    const r = await this.db.query(
      `SELECT * FROM payments.ordenes WHERE usuario_id=$1 AND curso_id=$2 AND estado='PENDIENTE' ORDER BY created_at DESC LIMIT 1`,
      [usuarioId.valor, cursoId.valor],
    )
    return r.rows[0] ? cargarOrden(r.rows[0]) : null
  }
  async capturadaDe(usuarioId: UniqueId, cursoId: UniqueId): Promise<Orden | null> {
    const r = await this.db.query(
      `SELECT * FROM payments.ordenes WHERE usuario_id=$1 AND curso_id=$2 AND estado='CAPTURADA' LIMIT 1`,
      [usuarioId.valor, cursoId.valor],
    )
    return r.rows[0] ? cargarOrden(r.rows[0]) : null
  }
  async porUsuario(usuarioId: UniqueId): Promise<Orden[]> {
    const r = await this.db.query(
      'SELECT * FROM payments.ordenes WHERE usuario_id=$1 ORDER BY created_at DESC',
      [usuarioId.valor],
    )
    return r.rows.map(cargarOrden)
  }
  async todas(): Promise<Orden[]> {
    const r = await this.db.query('SELECT * FROM payments.ordenes ORDER BY created_at DESC')
    return r.rows.map(cargarOrden)
  }
  async vencidas(ahora: Date): Promise<Orden[]> {
    const r = await this.db.query(
      `SELECT * FROM payments.ordenes WHERE estado='PENDIENTE' AND expira_at <= $1`,
      [ahora],
    )
    return r.rows.map(cargarOrden)
  }
  async guardar(o: Orden): Promise<void> {
    const events = o.pullEvents()
    await this.db.transaction(async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [o.id.valor])
      const actual = (
        await tx.query(
          'SELECT estado,reembolsos_registrados FROM payments.ordenes WHERE id=$1 FOR UPDATE',
          [o.id.valor],
        )
      ).rows[0]
      if (actual?.estado === 'REEMBOLSADA' && o.estado !== 'REEMBOLSADA') return
      if (actual?.estado === 'CAPTURADA' && !['CAPTURADA', 'REEMBOLSADA'].includes(o.estado)) return
      const refunds = [
        ...new Map(
          [...(actual?.reembolsos_registrados ?? []), ...o.reembolsos].map(
            (r: { id: string; centavos: number }) => [r.id, r],
          ),
        ).values(),
      ]
      const estado =
        refunds.reduce((sum, r) => sum + r.centavos, 0) >= Math.round(o.monto.monto * 100) &&
        refunds.length
          ? 'REEMBOLSADA'
          : o.estado
      await tx.query(
        `INSERT INTO payments.ordenes (id,usuario_id,curso_id,monto,moneda,version_precio,estado,paypal_order_id,paypal_capture_id,comision,neto,expira_at,created_at,updated_at,atribucion,curso_titulo,reembolsos_registrados)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),$14::jsonb,$15,$16::jsonb)
        ON CONFLICT(id) DO UPDATE SET estado=EXCLUDED.estado,paypal_order_id=EXCLUDED.paypal_order_id,paypal_capture_id=EXCLUDED.paypal_capture_id,comision=EXCLUDED.comision,neto=EXCLUDED.neto,reembolsos_registrados=EXCLUDED.reembolsos_registrados,updated_at=now()`,
        [
          o.id.valor,
          o.usuarioId.valor,
          o.cursoId.valor,
          o.monto.monto,
          o.monto.moneda,
          o.versionPrecio,
          estado,
          o.paypalOrderId,
          o.paypalCaptureId,
          o.comision?.monto ?? null,
          o.neto?.monto ?? null,
          o.expiraAt,
          o.createdAt,
          JSON.stringify(o.atribucion),
          o.cursoTitulo,
          JSON.stringify(refunds),
        ],
      )
      for (const e of events) {
        const p = e.payload()
        const key = `${e.eventType}:${o.id.valor}:${p.reembolsoId ?? ''}`
        await tx.query(
          'INSERT INTO payments.outbox(event_id,event_type,aggregate_id,payload,dedupe_key,creado_at) VALUES ($1,$2,$3,$4::jsonb,$5,$6) ON CONFLICT(dedupe_key) DO NOTHING',
          [e.eventId, e.eventType, e.aggregateId, JSON.stringify(p), key, e.occurredAt],
        )
      }
    })
  }
}

export class DrizzlePrecioProyeccionRepository implements PrecioProyeccionRepository {
  constructor(private readonly db: Db) {}
  async porCursoId(cursoId: string): Promise<PrecioProyectado | null> {
    const r = await this.db.query('SELECT * FROM payments.precios_proyeccion WHERE curso_id=$1', [
      cursoId,
    ])
    const x = r.rows[0]
    return x
      ? {
          cursoId: String(x.curso_id),
          titulo: String(x.titulo),
          monto: Number(x.monto),
          moneda: String(x.moneda).trim(),
          versionPrecio: Number(x.version_precio),
          publicado: Boolean(x.publicado),
        }
      : null
  }
  async guardar(p: PrecioProyectado): Promise<void> {
    await this.db.query(
      `INSERT INTO payments.precios_proyeccion (curso_id,titulo,monto,moneda,version_precio,publicado) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (curso_id) DO UPDATE SET titulo=EXCLUDED.titulo,monto=EXCLUDED.monto,moneda=EXCLUDED.moneda,version_precio=EXCLUDED.version_precio,publicado=EXCLUDED.publicado,actualizado_at=now()`,
      [p.cursoId, p.titulo, p.monto, p.moneda, p.versionPrecio, p.publicado],
    )
  }
  async marcarPublicado(cursoId: string, publicado: boolean): Promise<void> {
    await this.db.query(
      'UPDATE payments.precios_proyeccion SET publicado=$1, actualizado_at=now() WHERE curso_id=$2',
      [publicado, cursoId],
    )
  }
}

export class DrizzleWebhookRepository implements WebhookRepository {
  constructor(private readonly db: Db) {}
  async registrarSiEsNuevo(w: WebhookCrudo): Promise<boolean> {
    const r = await this.db.query(
      `INSERT INTO payments.webhooks_paypal (paypal_event_id,event_type,firma_valida,payload) VALUES ($1,$2,$3,$4) ON CONFLICT (paypal_event_id) DO NOTHING RETURNING id`,
      [w.paypalEventId, w.eventType, w.firmaValida, JSON.stringify(w.payload)],
    )
    if (r.rows.length > 0) return true
    const existing = await this.db.query(
      'SELECT firma_valida,encolado_at FROM payments.webhooks_paypal WHERE paypal_event_id=$1',
      [w.paypalEventId],
    )
    return Boolean(existing.rows[0]?.firma_valida && !existing.rows[0]?.encolado_at)
  }
  async marcarEncolado(id: string): Promise<void> {
    await this.db.query(
      'UPDATE payments.webhooks_paypal SET encolado_at=now() WHERE paypal_event_id=$1 AND encolado_at IS NULL',
      [id],
    )
  }
  async porEventId(id: string): Promise<WebhookCrudo | null> {
    const r = await this.db.query(
      'SELECT paypal_event_id,event_type,firma_valida,payload FROM payments.webhooks_paypal WHERE paypal_event_id=$1',
      [id],
    )
    const x = r.rows[0]
    return x
      ? {
          paypalEventId: String(x.paypal_event_id),
          eventType: String(x.event_type),
          firmaValida: Boolean(x.firma_valida),
          payload: x.payload,
        }
      : null
  }
  async marcarProcesado(id: string, error?: string): Promise<void> {
    await this.db.query(
      'UPDATE payments.webhooks_paypal SET procesado_at=now(), error=$2 WHERE paypal_event_id=$1',
      [id, error ?? null],
    )
  }
}

export class SqsColaWebhooks implements ColaWebhooks {
  constructor(
    private readonly sqs: import('@aws-sdk/client-sqs').SQSClient,
    private readonly queueUrl: string,
  ) {}
  async encolar(paypalEventId: string): Promise<void> {
    await this.sqs.send(
      new (await import('@aws-sdk/client-sqs')).SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify({
          eventId: crypto.randomUUID(),
          eventType: 'payments.webhook-recibido.interno',
          occurredAt: new Date().toISOString(),
          aggregateId: paypalEventId,
          correlationId: crypto.randomUUID(),
          payload: { paypalEventId },
        }),
      }),
    )
  }
}
