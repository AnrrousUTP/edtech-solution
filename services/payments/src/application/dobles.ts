import { Ok, type Result, type UniqueId } from '@edtech/shared-kernel'
import type { Orden } from '../domain/entities/orden.entity'
import type { PasarelaError } from '../domain/module.errors'
import type {
  ColaWebhooks,
  OrdenRepository,
  PrecioProyeccionRepository,
  PrecioProyectado,
  WebhookCrudo,
  WebhookRepository,
} from '../domain/ports-out/orden.repository'
import type {
  CapturaPasarela,
  OrdenPasarela,
  PasarelaPagoPort,
} from '../domain/ports-out/pasarela-pago.port'
import { Dinero } from '../domain/value-objects/dinero.vo'

export class InMemoryOrdenRepository implements OrdenRepository {
  readonly ordenes = new Map<string, Orden>()

  async porId(id: UniqueId): Promise<Orden | null> {
    return this.ordenes.get(id.valor) ?? null
  }
  async porPaypalOrderId(paypalOrderId: string): Promise<Orden | null> {
    return [...this.ordenes.values()].find(o => o.paypalOrderId === paypalOrderId) ?? null
  }
  async porPaypalCaptureId(capturaId: string): Promise<Orden | null> {
    if (!capturaId) return null
    return [...this.ordenes.values()].find(o => o.paypalCaptureId === capturaId) ?? null
  }
  async pendienteDe(usuarioId: UniqueId, cursoId: UniqueId): Promise<Orden | null> {
    return (
      [...this.ordenes.values()].find(
        o =>
          o.usuarioId.valor === usuarioId.valor &&
          o.cursoId.valor === cursoId.valor &&
          o.estado === 'PENDIENTE',
      ) ?? null
    )
  }
  async capturadaDe(usuarioId: UniqueId, cursoId: UniqueId): Promise<Orden | null> {
    return (
      [...this.ordenes.values()].find(
        o =>
          o.usuarioId.valor === usuarioId.valor &&
          o.cursoId.valor === cursoId.valor &&
          o.estado === 'CAPTURADA',
      ) ?? null
    )
  }
  async porUsuario(usuarioId: UniqueId): Promise<Orden[]> {
    return [...this.ordenes.values()].filter(o => o.usuarioId.valor === usuarioId.valor)
  }
  async vencidas(ahora: Date): Promise<Orden[]> {
    return [...this.ordenes.values()].filter(o => o.estado === 'PENDIENTE' && o.expiraAt <= ahora)
  }
  async guardar(orden: Orden): Promise<void> {
    this.ordenes.set(orden.id.valor, orden)
  }
}

export class InMemoryPrecioRepository implements PrecioProyeccionRepository {
  readonly precios = new Map<string, PrecioProyectado>()

  async porCursoId(cursoId: string): Promise<PrecioProyectado | null> {
    return this.precios.get(cursoId) ?? null
  }
  async guardar(precio: PrecioProyectado): Promise<void> {
    this.precios.set(precio.cursoId, precio)
  }
  async marcarPublicado(cursoId: string, publicado: boolean): Promise<void> {
    const p = this.precios.get(cursoId)
    if (p) this.precios.set(cursoId, { ...p, publicado })
  }
}

export class InMemoryWebhookRepository implements WebhookRepository {
  readonly webhooks = new Map<string, WebhookCrudo & { procesado: boolean; error?: string }>()

  async registrarSiEsNuevo(webhook: WebhookCrudo): Promise<boolean> {
    if (this.webhooks.has(webhook.paypalEventId)) return false
    this.webhooks.set(webhook.paypalEventId, { ...webhook, procesado: false })
    return true
  }
  async porEventId(paypalEventId: string): Promise<WebhookCrudo | null> {
    return this.webhooks.get(paypalEventId) ?? null
  }
  async marcarProcesado(paypalEventId: string, error?: string): Promise<void> {
    const w = this.webhooks.get(paypalEventId)
    if (w) this.webhooks.set(paypalEventId, { ...w, procesado: true, ...(error ? { error } : {}) })
  }
}

export class FakeColaWebhooks implements ColaWebhooks {
  readonly encolados: string[] = []
  async encolar(paypalEventId: string): Promise<void> {
    this.encolados.push(paypalEventId)
  }
}

/** Doble de la pasarela con la verificación de firma controlada (doc 09 §6.3):
 *  para los tests automatizados no se usa ngrok en absoluto. */
export class FakePasarela implements PasarelaPagoPort {
  capturas = 0
  firmaValida = true
  estadoCaptura: 'COMPLETADA' | 'PENDIENTE' | 'DENEGADA' = 'COMPLETADA'
  fallarCrear = false
  readonly ordenesCreadas: string[] = []

  async crearOrden(input: {
    ordenId: string
    monto: Dinero
  }): Promise<Result<OrdenPasarela, PasarelaError>> {
    if (this.fallarCrear) {
      const { PasarelaError: E } = await import('../domain/module.errors')
      return { ok: false, error: new E('caída simulada') }
    }
    this.ordenesCreadas.push(input.ordenId)
    return Ok({
      proveedorOrdenId: `PAYPAL-${input.ordenId.slice(0, 8)}`,
      urlAprobacion: `https://sandbox.paypal.com/checkoutnow?token=${input.ordenId.slice(0, 8)}`,
    })
  }

  async capturar(proveedorOrdenId: string): Promise<Result<CapturaPasarela, PasarelaError>> {
    this.capturas += 1
    const moneda = 'USD'
    return Ok({
      capturaId: `CAP-${proveedorOrdenId}`,
      montoCapturado: Dinero.desdeCentavos(1990, moneda),
      comision: Dinero.desdeCentavos(137, moneda), // ~5.4% + 0.30
      neto: Dinero.desdeCentavos(1853, moneda),
      estado: this.estadoCaptura,
    })
  }

  async verificarFirmaWebhook(): Promise<boolean> {
    return this.firmaValida
  }

  async reembolsar(capturaId: string): Promise<Result<{ reembolsoId: string }, PasarelaError>> {
    return Ok({ reembolsoId: `REF-${capturaId}` })
  }
}
