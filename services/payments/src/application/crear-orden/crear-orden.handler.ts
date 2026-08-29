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
import { MS_EXPIRACION_ORDEN, Orden } from '../../domain/entities/orden.entity'
import {
  CursoGratuitoError,
  CursoNoDisponibleError,
  YaCompradoError,
  type PaymentsError,
} from '../../domain/module.errors'
import type {
  OrdenRepository,
  PrecioProyeccionRepository,
} from '../../domain/ports-out/orden.repository'
import type { PasarelaPagoPort } from '../../domain/ports-out/pasarela-pago.port'
import { Dinero } from '../../domain/value-objects/dinero.vo'

export type CrearOrdenCommand = Command & {
  readonly _tag: 'CrearOrden'
  readonly usuarioId: string
  readonly cursoId: string
  readonly urlRetorno: string
  readonly urlCancelacion: string
}

export type CrearOrdenResponse = {
  ordenId: string
  urlAprobacion: string
  monto: number
  moneda: string
  reutilizada: boolean
}

/** Lee el precio de SU proyección — NO llama a catalog (doc 09 §2, D14). */
export class CrearOrdenHandler implements CommandHandler<
  CrearOrdenCommand,
  CrearOrdenResponse,
  PaymentsError
> {
  readonly handles = 'CrearOrden' as const

  constructor(
    private readonly ordenes: OrdenRepository,
    private readonly precios: PrecioProyeccionRepository,
    private readonly pasarela: PasarelaPagoPort,
    private readonly publisher: IEventPublisher,
    private readonly reloj: Reloj,
  ) {}

  async execute(cmd: CrearOrdenCommand): Promise<Result<CrearOrdenResponse, PaymentsError>> {
    const usuarioId = UniqueId.desde(cmd.usuarioId)
    const cursoId = UniqueId.desde(cmd.cursoId)
    const ahora = this.reloj.ahora()

    // Comprar un curso ya comprado: 409 antes de crear la orden (doc 09 §8)
    const yaComprado = await this.ordenes.capturadaDe(usuarioId, cursoId)
    if (yaComprado) return Err(new YaCompradoError(cmd.cursoId))

    const precio = await this.precios.porCursoId(cmd.cursoId)
    if (!precio || !precio.publicado) return Err(new CursoNoDisponibleError(cmd.cursoId))

    const monto = Dinero.crear(precio.monto, precio.moneda)
    if (isErr(monto)) return Err(monto.error)
    // Un curso gratuito no pasa por PayPal (doc 09 §8)
    if (monto.value.esCero) return Err(new CursoGratuitoError(cmd.cursoId))

    // Doble clic en "Pagar": se reutiliza la PENDIENTE viva (doc 09 §8)
    const pendiente = await this.ordenes.pendienteDe(usuarioId, cursoId)
    if (pendiente && ahora < pendiente.expiraAt && pendiente.paypalOrderId) {
      const r = await this.pasarela.crearOrden({
        ordenId: pendiente.id.valor,
        monto: pendiente.monto,
        descripcion: precio.titulo,
        urlRetorno: cmd.urlRetorno,
        urlCancelacion: cmd.urlCancelacion,
      })
      if (isErr(r)) return Err(r.error)
      pendiente.vincularConPasarela(r.value.proveedorOrdenId)
      await this.ordenes.guardar(pendiente)
      return Ok({
        ordenId: pendiente.id.valor,
        urlAprobacion: r.value.urlAprobacion,
        monto: pendiente.monto.monto,
        moneda: pendiente.monto.moneda,
        reutilizada: true,
      })
    }

    const orden = Orden.crear({
      usuarioId,
      cursoId,
      monto: monto.value,
      versionPrecio: precio.versionPrecio,
      ahora,
      expiraAt: new Date(ahora.getTime() + MS_EXPIRACION_ORDEN),
    })

    const r = await this.pasarela.crearOrden({
      ordenId: orden.id.valor,
      monto: orden.monto,
      descripcion: precio.titulo,
      urlRetorno: cmd.urlRetorno,
      urlCancelacion: cmd.urlCancelacion,
    })
    if (isErr(r)) return Err(r.error)

    orden.vincularConPasarela(r.value.proveedorOrdenId)
    await this.ordenes.guardar(orden)
    await this.publisher.publish(orden.pullEvents())

    return Ok({
      ordenId: orden.id.valor,
      urlAprobacion: r.value.urlAprobacion,
      monto: orden.monto.monto,
      moneda: orden.monto.moneda,
      reutilizada: false,
    })
  }
}
