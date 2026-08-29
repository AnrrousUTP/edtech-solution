import { AggregateRoot, Err, Ok, type Result, UniqueId } from '@edtech/shared-kernel'
import { OrdenCreadaEvent } from '../events/orden-creada.event'
import { PagoConfirmadoEvent } from '../events/pago-confirmado.event'
import { PagoFallidoEvent } from '../events/pago-fallido.event'
import { PagoReembolsadoEvent } from '../events/pago-reembolsado.event'
import { OrdenExpiradaError, OrdenNoCapturableError, type PaymentsError } from '../module.errors'
import type { Dinero } from '../value-objects/dinero.vo'

export type EstadoOrden =
  'PENDIENTE' | 'APROBADA' | 'CAPTURADA' | 'FALLIDA' | 'EXPIRADA' | 'REEMBOLSADA'

/** Una orden PENDIENTE expira a las 24 h (doc 09 §8). La regla vive en el
 *  dominio; la fecha concreta la construye el handler, que tiene el Reloj:
 *  el dominio recibe fechas, no las fabrica (doc 12 §3). */
export const MS_EXPIRACION_ORDEN = 24 * 60 * 60 * 1000

type Props = {
  id: UniqueId
  usuarioId: UniqueId
  cursoId: UniqueId
  monto: Dinero // congelado al crear: no cambia aunque cambie el precio
  versionPrecio: number
  estado: EstadoOrden
  paypalOrderId: string | null
  paypalCaptureId: string | null
  comision: Dinero | null
  neto: Dinero | null
  expiraAt: Date
  createdAt: Date
}

export class Orden extends AggregateRoot {
  private constructor(private readonly props: Props) {
    super()
  }

  static crear(datos: {
    usuarioId: UniqueId
    cursoId: UniqueId
    monto: Dinero
    versionPrecio: number
    ahora: Date
    /** `ahora + MS_EXPIRACION_ORDEN`, calculado por el handler. */
    expiraAt: Date
  }): Orden {
    const o = new Orden({
      id: UniqueId.nuevo(),
      usuarioId: datos.usuarioId,
      cursoId: datos.cursoId,
      monto: datos.monto,
      versionPrecio: datos.versionPrecio,
      estado: 'PENDIENTE',
      paypalOrderId: null,
      paypalCaptureId: null,
      comision: null,
      neto: null,
      expiraAt: datos.expiraAt,
      createdAt: datos.ahora,
    })
    o.record(
      new OrdenCreadaEvent(
        o.props.id.valor,
        datos.usuarioId.valor,
        datos.cursoId.valor,
        datos.monto.monto,
        datos.monto.moneda,
      ),
    )
    return o
  }

  static reconstruir(props: Props): Orden {
    return new Orden(props)
  }

  vincularConPasarela(proveedorOrdenId: string): void {
    this.props.paypalOrderId = proveedorOrdenId
  }

  /** CHECKOUT.ORDER.APPROVED: el usuario aprobó, aún no se cobró. */
  marcarAprobada(): void {
    if (this.props.estado === 'PENDIENTE') this.props.estado = 'APROBADA'
  }

  /** `pago-confirmado` se emite SOLO acá: con la captura confirmada por PayPal.
   *  Nunca al recibir el webhook, nunca al aprobar (doc 09 §4). Idempotente:
   *  la segunda confirmación de la misma captura no re-emite. */
  confirmarCaptura(datos: {
    capturaId: string
    comision: Dinero
    neto: Dinero
    ahora: Date
  }): Result<{ nueva: boolean }, PaymentsError> {
    if (this.props.estado === 'CAPTURADA') {
      return Ok({ nueva: false }) // el flujo síncrono y el webhook: gana el primero
    }
    if (this.props.estado === 'REEMBOLSADA' || this.props.estado === 'FALLIDA')
      return Err(new OrdenNoCapturableError(this.props.estado))
    if (this.props.estado === 'EXPIRADA') return Err(new OrdenExpiradaError(this.props.id.valor))

    this.props.estado = 'CAPTURADA'
    this.props.paypalCaptureId = datos.capturaId
    this.props.comision = datos.comision
    this.props.neto = datos.neto
    this.record(
      new PagoConfirmadoEvent(
        this.props.id.valor,
        this.props.usuarioId.valor,
        this.props.cursoId.valor,
        this.props.monto.monto,
        this.props.monto.moneda,
        datos.capturaId,
        datos.ahora,
      ),
    )
    return Ok({ nueva: true })
  }

  marcarFallida(motivo: string): void {
    if (this.props.estado === 'CAPTURADA' || this.props.estado === 'REEMBOLSADA') return
    this.props.estado = 'FALLIDA'
    this.record(
      new PagoFallidoEvent(
        this.props.id.valor,
        this.props.usuarioId.valor,
        this.props.cursoId.valor,
        motivo,
      ),
    )
  }

  registrarReembolso(reembolsoId: string, monto: Dinero): boolean {
    if (this.props.estado === 'REEMBOLSADA') return false
    this.props.estado = 'REEMBOLSADA'
    this.record(
      new PagoReembolsadoEvent(
        this.props.id.valor,
        this.props.usuarioId.valor,
        this.props.cursoId.valor,
        monto.monto,
        reembolsoId,
      ),
    )
    return true
  }

  /** Job de expiración (doc 09 §8): una orden PENDIENTE no vive para siempre. */
  expirarSiCorresponde(ahora: Date): boolean {
    if (this.props.estado !== 'PENDIENTE') return false
    if (ahora < this.props.expiraAt) return false
    this.props.estado = 'EXPIRADA'
    return true
  }

  puedeCapturarse(ahora: Date): Result<void, PaymentsError> {
    if (this.props.estado === 'CAPTURADA') return Ok(undefined) // idempotente
    if (this.props.estado !== 'PENDIENTE' && this.props.estado !== 'APROBADA')
      return Err(new OrdenNoCapturableError(this.props.estado))
    if (ahora >= this.props.expiraAt) return Err(new OrdenExpiradaError(this.props.id.valor))
    return Ok(undefined)
  }

  get id(): UniqueId {
    return this.props.id
  }
  get usuarioId(): UniqueId {
    return this.props.usuarioId
  }
  get cursoId(): UniqueId {
    return this.props.cursoId
  }
  get monto(): Dinero {
    return this.props.monto
  }
  get versionPrecio(): number {
    return this.props.versionPrecio
  }
  get estado(): EstadoOrden {
    return this.props.estado
  }
  get paypalOrderId(): string | null {
    return this.props.paypalOrderId
  }
  get paypalCaptureId(): string | null {
    return this.props.paypalCaptureId
  }
  get comision(): Dinero | null {
    return this.props.comision
  }
  get neto(): Dinero | null {
    return this.props.neto
  }
  get expiraAt(): Date {
    return this.props.expiraAt
  }
  get createdAt(): Date {
    return this.props.createdAt
  }
}
