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
  AtribucionInvalidaError,
  CursoGratuitoError,
  CursoNoDisponibleError,
  YaCompradoError,
  type PaymentsError,
} from '../../domain/module.errors'
import type {
  OrdenRepository,
  PrecioProyeccionRepository,
} from '../../domain/ports-out/orden.repository'
import type { VerificadorAtribucionPort } from '../../domain/ports-out/atribucion.port'
import { Dinero } from '../../domain/value-objects/dinero.vo'

export type CrearCompraDirectaCommand = Command & {
  readonly _tag: 'CrearCompraDirecta'
  readonly usuarioId: string
  readonly cursoId: string
  readonly pruebaAtribucion?: string
}

export type CrearCompraDirectaResponse = {
  ordenId: string
  cursoId: string
  estado: 'CAPTURADA'
  monto: number
  moneda: string
}

/** Confirma una compra interna en una sola escritura; no contacta pasarelas externas. */
export class CrearCompraDirectaHandler implements CommandHandler<
  CrearCompraDirectaCommand,
  CrearCompraDirectaResponse,
  PaymentsError
> {
  readonly handles = 'CrearCompraDirecta' as const

  constructor(
    private readonly ordenes: OrdenRepository,
    private readonly precios: PrecioProyeccionRepository,
    private readonly publisher: IEventPublisher,
    private readonly reloj: Reloj,
    private readonly atribuciones?: VerificadorAtribucionPort,
  ) {}

  async execute(
    cmd: CrearCompraDirectaCommand,
  ): Promise<Result<CrearCompraDirectaResponse, PaymentsError>> {
    const usuarioId = UniqueId.desde(cmd.usuarioId)
    const cursoId = UniqueId.desde(cmd.cursoId)
    const ahora = this.reloj.ahora()

    if (await this.ordenes.capturadaDe(usuarioId, cursoId))
      return Err(new YaCompradoError(cmd.cursoId))

    const precio = await this.precios.porCursoId(cmd.cursoId)
    if (!precio || !precio.publicado) return Err(new CursoNoDisponibleError(cmd.cursoId))
    const monto = Dinero.crear(precio.monto, precio.moneda)
    if (isErr(monto)) return Err(monto.error)
    if (monto.value.esCero) return Err(new CursoGratuitoError(cmd.cursoId))

    let atribucion = null
    if (cmd.pruebaAtribucion) {
      if (!this.atribuciones) return Err(new AtribucionInvalidaError())
      const verificada = await this.atribuciones.verificar(cmd.pruebaAtribucion, cmd.usuarioId)
      if (isErr(verificada)) return Err(verificada.error)
      atribucion = verificada.value
    }

    const orden = Orden.crear({
      usuarioId,
      cursoId,
      monto: monto.value,
      versionPrecio: precio.versionPrecio,
      ahora,
      expiraAt: new Date(ahora.getTime() + MS_EXPIRACION_ORDEN),
      atribucion: atribucion && monto.value.moneda === 'USD' ? atribucion : null,
      cursoTitulo: precio.titulo,
    })
    const confirmada = orden.confirmarCompraDirecta(ahora)
    if (isErr(confirmada)) return Err(confirmada.error)

    await this.ordenes.guardar(orden)
    await this.publisher.publish(orden.pullEvents())

    return Ok({
      ordenId: orden.id.valor,
      cursoId: cursoId.valor,
      estado: 'CAPTURADA',
      monto: monto.value.monto,
      moneda: monto.value.moneda,
    })
  }
}
