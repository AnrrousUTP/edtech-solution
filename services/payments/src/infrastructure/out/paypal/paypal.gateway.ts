import { Ok, Err, type Result } from '@edtech/shared-kernel'
import type {
  OrdenPasarela,
  CapturaPasarela,
  PasarelaPagoPort,
} from '../../../domain/ports-out/pasarela-pago.port'
import { PasarelaError } from '../../../domain/module.errors'
import { Dinero } from '../../../domain/value-objects/dinero.vo'

export type CredencialesPaypal = {
  env: 'sandbox' | 'live'
  clientId: string
  clientSecret: string
  webhookId: string
  moneda: string
}
// eslint-disable-next-line -- PayPal entrega un objeto JSON abierto según la operación
type Json = Record<string, any>

export class PaypalGateway implements PasarelaPagoPort {
  private readonly base: string
  constructor(private readonly credenciales: CredencialesPaypal) {
    this.base =
      credenciales.env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
  }

  private async accessToken(): Promise<string> {
    const auth = Buffer.from(
      `${this.credenciales.clientId}:${this.credenciales.clientSecret}`,
    ).toString('base64')
    const r = await fetch(`${this.base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) throw new Error(`token PayPal ${r.status}`)
    return String(((await r.json()) as Json).access_token ?? '')
  }
  private async api(path: string, init: RequestInit = {}): Promise<Json> {
    const token = await this.accessToken()
    const r = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(15000),
    })
    const data = (await r.json().catch(() => ({}))) as Json
    if (!r.ok)
      throw new Error(`PayPal ${r.status}: ${String(data.name ?? data.message ?? 'error')}`)
    return data
  }
  async crearOrden(input: {
    ordenId: string
    monto: Dinero
    descripcion: string
    urlRetorno: string
    urlCancelacion: string
  }): Promise<Result<OrdenPasarela, PasarelaError>> {
    try {
      const data = await this.api('/v2/checkout/orders', {
        method: 'POST',
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [
            {
              custom_id: input.ordenId,
              description: input.descripcion,
              amount: { currency_code: input.monto.moneda, value: input.monto.comoTexto },
            },
          ],
          application_context: {
            return_url: input.urlRetorno,
            cancel_url: input.urlCancelacion,
            user_action: 'PAY_NOW',
          },
        }),
      })
      const url = (data.links as Json[] | undefined)?.find(x => x.rel === 'approve')?.href
      if (!data.id || !url) throw new Error('PayPal no devolvió aprobación')
      return Ok({ proveedorOrdenId: String(data.id), urlAprobacion: String(url) })
    } catch (e) {
      return Err(await this.error(e))
    }
  }
  async capturar(proveedorOrdenId: string): Promise<Result<CapturaPasarela, PasarelaError>> {
    try {
      const data = await this.api(
        `/v2/checkout/orders/${encodeURIComponent(proveedorOrdenId)}/capture`,
        { method: 'POST', body: '{}' },
      )
      const c = (data.purchase_units?.[0]?.payments?.captures?.[0] ?? {}) as Json
      const amount = (c.amount ?? {}) as Json
      const bruto = Dinero.crear(
        Number(amount.value ?? 0),
        String(amount.currency_code ?? this.credenciales.moneda),
      )
      if (!bruto.ok) return Err(new PasarelaError(bruto.error.message))
      const desglose = (c.seller_receivable_breakdown ?? {}) as Json
      const fee = Dinero.crear(
        Number(desglose.paypal_fee?.value ?? 0),
        String(desglose.paypal_fee?.currency_code ?? bruto.value.moneda),
      )
      const net = Dinero.crear(
        Number(desglose.net_amount?.value ?? bruto.value.monto),
        String(desglose.net_amount?.currency_code ?? bruto.value.moneda),
      )
      return Ok({
        capturaId: String(c.id ?? ''),
        montoCapturado: bruto.value,
        comision: fee.ok ? fee.value : Dinero.desdeCentavos(0, bruto.value.moneda),
        neto: net.ok ? net.value : bruto.value,
        estado:
          data.status === 'COMPLETED'
            ? 'COMPLETADA'
            : data.status === 'PENDING'
              ? 'PENDIENTE'
              : 'DENEGADA',
      })
    } catch (e) {
      return Err(await this.error(e))
    }
  }
  async verificarFirmaWebhook(
    headers: Record<string, string>,
    cuerpoCrudo: string,
  ): Promise<boolean> {
    if (!this.credenciales.webhookId) return false
    const raw = headers['paypal-cert-url']
    if (!raw) return false
    try {
      const u = new URL(raw)
      const host = u.hostname.toLowerCase()
      const paypal = host === 'paypal.com' || host.endsWith('.paypal.com')
      if (u.protocol !== 'https:' || !paypal) return false
    } catch {
      return false
    }
    try {
      const data = await this.api('/v1/notifications/verify-webhook-signature', {
        method: 'POST',
        body: JSON.stringify({
          transmission_id: headers['paypal-transmission-id'],
          transmission_time: headers['paypal-transmission-time'],
          cert_url: raw,
          auth_algo: headers['paypal-auth-algo'],
          transmission_sig: headers['paypal-transmission-sig'],
          webhook_id: this.credenciales.webhookId,
          webhook_event: JSON.parse(cuerpoCrudo),
        }),
      })
      return data.verification_status === 'SUCCESS'
    } catch {
      return false
    }
  }
  async reembolsar(
    capturaId: string,
    monto: Dinero,
    motivo: string,
  ): Promise<Result<{ reembolsoId: string }, PasarelaError>> {
    try {
      const data = await this.api(`/v2/payments/captures/${encodeURIComponent(capturaId)}/refund`, {
        method: 'POST',
        body: JSON.stringify({
          amount: { value: monto.comoTexto, currency_code: monto.moneda },
          note_to_payer: motivo,
        }),
      })
      return Ok({ reembolsoId: String(data.id ?? '') })
    } catch (e) {
      return Err(await this.error(e))
    }
  }
  private async error(e: unknown): Promise<PasarelaError> {
    const { PasarelaError: E } = await import('../../../domain/module.errors')
    return new E(e instanceof Error ? e.message : String(e))
  }
}
