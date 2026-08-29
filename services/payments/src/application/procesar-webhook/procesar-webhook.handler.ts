import {
  Err,
  Ok,
  UniqueId,
  isErr,
  log,
  type Command,
  type CommandBus,
  type CommandHandler,
  type IEventPublisher,
  type Reloj,
  type Result,
} from '@edtech/shared-kernel'
import { OrdenNoEncontradaError, type PaymentsError } from '../../domain/module.errors'
import type { OrdenRepository, WebhookRepository } from '../../domain/ports-out/orden.repository'
import { Dinero } from '../../domain/value-objects/dinero.vo'
import type { CapturarPagoCommand } from '../capturar-pago/capturar-pago.handler'

export type ProcesarWebhookCommand = Command & {
  readonly _tag: 'ProcesarWebhook'
  readonly paypalEventId: string
  readonly eventType: string
  readonly recurso: Record<string, unknown>
}

export type ProcesarWebhookResponse = { efecto: string }

/** Worker de `sqs-payments-webhooks` (doc 09 §4). El endpoint HTTP solo
 *  verifica la firma, registra el crudo y encola: acá ocurre el trabajo, con
 *  reintentos propios y DLQ. */
export class ProcesarWebhookHandler implements CommandHandler<
  ProcesarWebhookCommand,
  ProcesarWebhookResponse,
  PaymentsError
> {
  readonly handles = 'ProcesarWebhook' as const

  constructor(
    private readonly ordenes: OrdenRepository,
    private readonly webhooks: WebhookRepository,
    private readonly publisher: IEventPublisher,
    private readonly reloj: Reloj,
    private readonly bus: () => CommandBus,
  ) {}

  async execute(
    cmd: ProcesarWebhookCommand,
  ): Promise<Result<ProcesarWebhookResponse, PaymentsError>> {
    const r = await this.#despachar(cmd)
    if (isErr(r)) {
      await this.webhooks.marcarProcesado(cmd.paypalEventId, r.error.message)
      return r
    }
    await this.webhooks.marcarProcesado(cmd.paypalEventId)
    return r
  }

  async #despachar(
    cmd: ProcesarWebhookCommand,
  ): Promise<Result<ProcesarWebhookResponse, PaymentsError>> {
    switch (cmd.eventType) {
      case 'CHECKOUT.ORDER.APPROVED':
        return this.#aprobada(cmd.recurso)
      case 'PAYMENT.CAPTURE.COMPLETED':
        return this.#capturaCompletada(cmd.recurso)
      case 'PAYMENT.CAPTURE.DENIED':
        return this.#capturaDenegada(cmd.recurso)
      case 'PAYMENT.CAPTURE.REFUNDED':
        return this.#reembolsada(cmd.recurso)
      default:
        log.info('evento de PayPal sin efecto', { eventType: cmd.eventType })
        return Ok({ efecto: 'ignorado' })
    }
  }

  /** Marca APROBADA y captura desde el worker si el flujo síncrono no lo hizo
   *  (el usuario cerró el navegador tras aprobar — doc 09 §8). */
  async #aprobada(
    recurso: Record<string, unknown>,
  ): Promise<Result<ProcesarWebhookResponse, PaymentsError>> {
    const paypalOrderId = String(recurso.id ?? '')
    const orden = await this.ordenes.porPaypalOrderId(paypalOrderId)
    if (!orden) return Err(new OrdenNoEncontradaError(`paypal ${paypalOrderId}`))

    orden.marcarAprobada()
    await this.ordenes.guardar(orden)

    const cmd: CapturarPagoCommand = { _tag: 'CapturarPago', ordenId: orden.id.valor }
    const captura = await this.bus().dispatch<unknown, PaymentsError>(cmd)
    return Ok({ efecto: captura.ok ? 'aprobada-y-capturada' : 'aprobada' })
  }

  /** El evento que confirma el dinero. Idempotente por la entidad. */
  async #capturaCompletada(
    recurso: Record<string, unknown>,
  ): Promise<Result<ProcesarWebhookResponse, PaymentsError>> {
    const capturaId = String(recurso.id ?? '')
    const ordenId = String(recurso.custom_id ?? '') // nuestro id (doc 09 §1)

    const orden = ordenId
      ? await this.ordenes.porId(UniqueId.desde(ordenId))
      : await this.ordenes.porPaypalCaptureId(capturaId)
    if (!orden) return Err(new OrdenNoEncontradaError(ordenId || capturaId))

    const { comision, neto } = extraerImportes(recurso, orden.monto)
    const r = orden.confirmarCaptura({
      capturaId,
      comision,
      neto,
      ahora: this.reloj.ahora(),
    })
    if (isErr(r)) return Err(r.error)

    await this.ordenes.guardar(orden)
    await this.publisher.publish(orden.pullEvents())
    return Ok({ efecto: r.value.nueva ? 'pago-confirmado' : 'ya-confirmado' })
  }

  async #capturaDenegada(
    recurso: Record<string, unknown>,
  ): Promise<Result<ProcesarWebhookResponse, PaymentsError>> {
    const ordenId = String(recurso.custom_id ?? '')
    const orden = ordenId ? await this.ordenes.porId(UniqueId.desde(ordenId)) : null
    if (!orden) return Err(new OrdenNoEncontradaError(ordenId || 'sin custom_id'))

    orden.marcarFallida('PayPal denegó la captura')
    await this.ordenes.guardar(orden)
    await this.publisher.publish(orden.pullEvents())
    return Ok({ efecto: 'pago-fallido' })
  }

  async #reembolsada(
    recurso: Record<string, unknown>,
  ): Promise<Result<ProcesarWebhookResponse, PaymentsError>> {
    const reembolsoId = String(recurso.id ?? '')
    const capturaId = String(
      ((recurso.links as { rel?: string; href?: string }[] | undefined) ?? [])
        .find(l => l.rel === 'up')
        ?.href?.split('/')
        .pop() ??
        recurso.custom_id ??
        '',
    )
    const orden =
      (await this.ordenes.porPaypalCaptureId(capturaId)) ??
      (recurso.custom_id
        ? await this.ordenes.porId(UniqueId.desde(String(recurso.custom_id)))
        : null)
    if (!orden) return Err(new OrdenNoEncontradaError(capturaId || reembolsoId))

    const monto = extraerMonto(recurso.amount, orden.monto)
    const registrado = orden.registrarReembolso(reembolsoId, monto)
    if (!registrado) return Ok({ efecto: 'ya-reembolsado' })

    await this.ordenes.guardar(orden)
    await this.publisher.publish(orden.pullEvents())
    return Ok({ efecto: 'pago-reembolsado' })
  }
}

const extraerMonto = (bruto: unknown, porDefecto: Dinero): Dinero => {
  const obj = bruto as { value?: string; currency_code?: string } | undefined
  if (!obj?.value) return porDefecto
  const d = Dinero.crear(Number(obj.value), obj.currency_code ?? porDefecto.moneda)
  return d.ok ? d.value : porDefecto
}

/** La comisión y el neto se guardan TAL COMO los devuelve PayPal, no
 *  calculados con una fórmula propia que envejece (doc 09 §7). */
const extraerImportes = (
  recurso: Record<string, unknown>,
  montoOrden: Dinero,
): { comision: Dinero; neto: Dinero } => {
  const desglose =
    (recurso.seller_receivable_breakdown as
      | {
          paypal_fee?: { value?: string; currency_code?: string }
          net_amount?: { value?: string; currency_code?: string }
        }
      | undefined) ?? {}
  const cero = Dinero.desdeCentavos(0, montoOrden.moneda)
  return {
    comision: extraerMonto(desglose.paypal_fee, cero),
    neto: extraerMonto(desglose.net_amount, montoOrden),
  }
}
