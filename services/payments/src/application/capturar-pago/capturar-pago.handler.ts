import {
  Err,
  Ok,
  UniqueId,
  isErr,
  type Command,
  type CommandHandler,
  type IEventPublisher,
  type Reloj,
  type Result,
} from '@edtech/shared-kernel'
import {
  OrdenAjenaError,
  OrdenNoCapturableError,
  OrdenNoEncontradaError,
  PasarelaError,
  type PaymentsError,
} from '../../domain/module.errors'
import type { OrdenRepository } from '../../domain/ports-out/orden.repository'
import type { PasarelaPagoPort } from '../../domain/ports-out/pasarela-pago.port'

export type CapturarPagoCommand = Command & {
  readonly _tag: 'CapturarPago'
  readonly ordenId: string
  /** Ausente cuando la captura viene del worker del webhook (no hay usuario). */
  readonly usuarioId?: string
}

export type CapturarPagoResponse = {
  estado: string
  capturaId: string | null
  yaEstabaCapturada: boolean
}

/** El pago se confirma dos veces a propósito (doc 09 §2): por la captura
 *  síncrona y por el webhook. El que llega primero gana; el segundo se
 *  descarta por idempotencia — la entidad no re-emite pago-confirmado. */
export class CapturarPagoHandler implements CommandHandler<
  CapturarPagoCommand,
  CapturarPagoResponse,
  PaymentsError
> {
  readonly handles = 'CapturarPago' as const

  constructor(
    private readonly ordenes: OrdenRepository,
    private readonly pasarela: PasarelaPagoPort,
    private readonly publisher: IEventPublisher,
    private readonly reloj: Reloj,
  ) {}

  async execute(cmd: CapturarPagoCommand): Promise<Result<CapturarPagoResponse, PaymentsError>> {
    const orden = await this.ordenes.porId(UniqueId.desde(cmd.ordenId))
    if (!orden) return Err(new OrdenNoEncontradaError(cmd.ordenId))
    if (cmd.usuarioId && orden.usuarioId.valor !== cmd.usuarioId.toLowerCase())
      return Err(new OrdenAjenaError(cmd.ordenId))

    if (orden.estado === 'CAPTURADA') {
      return Ok({
        estado: orden.estado,
        capturaId: orden.paypalCaptureId,
        yaEstabaCapturada: true,
      })
    }

    const permitido = orden.puedeCapturarse(this.reloj.ahora())
    if (isErr(permitido)) return Err(permitido.error)
    if (!orden.paypalOrderId)
      return Err(new OrdenNoCapturableError('la orden no llegó a la pasarela'))

    const captura = await this.pasarela.capturar(orden.paypalOrderId)
    if (isErr(captura)) return Err(captura.error) // infraestructura: el webhook la rescata

    if (captura.value.estado === 'DENEGADA') {
      orden.marcarFallida('la pasarela denegó la captura')
      await this.ordenes.guardar(orden)
      await this.publisher.publish(orden.pullEvents())
      return Ok({ estado: orden.estado, capturaId: null, yaEstabaCapturada: false })
    }

    if (captura.value.estado === 'PENDIENTE') {
      // No se emite pago-confirmado: el dinero aún no está (doc 09 §4)
      orden.marcarAprobada()
      await this.ordenes.guardar(orden)
      return Err(new PasarelaError('la captura quedó pendiente en la pasarela'))
    }

    const r = orden.confirmarCaptura({
      capturaId: captura.value.capturaId,
      comision: captura.value.comision,
      neto: captura.value.neto,
      ahora: this.reloj.ahora(),
    })
    if (isErr(r)) return Err(r.error)

    await this.ordenes.guardar(orden)
    await this.publisher.publish(orden.pullEvents())

    return Ok({
      estado: orden.estado,
      capturaId: orden.paypalCaptureId,
      yaEstabaCapturada: !r.value.nueva,
    })
  }
}
