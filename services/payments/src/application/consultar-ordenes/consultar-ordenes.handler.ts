import {
  Err,
  Ok,
  UniqueId,
  type Command,
  type CommandHandler,
  type Query,
  type QueryHandler,
  type Result,
} from '@edtech/shared-kernel'
import {
  OrdenAjenaError,
  OrdenNoEncontradaError,
  type PaymentsError,
} from '../../domain/module.errors'
import type {
  OrdenRepository,
  PrecioProyeccionRepository,
} from '../../domain/ports-out/orden.repository'

export type EstadoOrdenQuery = Query & {
  readonly _tag: 'EstadoOrden'
  readonly ordenId: string
  readonly usuarioId: string
}

export type EstadoOrdenResponse = {
  ordenId: string
  cursoId: string
  estado: string
  monto: number
  moneda: string
  comision: number | null
  neto: number | null
}

/** El frontend hace polling honesto de esto tras capturar (doc 09 §2, paso 12). */
export class EstadoOrdenHandler implements QueryHandler<
  EstadoOrdenQuery,
  EstadoOrdenResponse,
  PaymentsError
> {
  readonly handles = 'EstadoOrden' as const

  constructor(private readonly ordenes: OrdenRepository) {}

  async execute(q: EstadoOrdenQuery): Promise<Result<EstadoOrdenResponse, PaymentsError>> {
    const orden = await this.ordenes.porId(UniqueId.desde(q.ordenId))
    if (!orden) return Err(new OrdenNoEncontradaError(q.ordenId))
    if (orden.usuarioId.valor !== q.usuarioId.toLowerCase())
      return Err(new OrdenAjenaError(q.ordenId))

    return Ok({
      ordenId: orden.id.valor,
      cursoId: orden.cursoId.valor,
      estado: orden.estado,
      monto: orden.monto.monto,
      moneda: orden.monto.moneda,
      comision: orden.comision?.monto ?? null,
      neto: orden.neto?.monto ?? null,
    })
  }
}

export type MisOrdenesQuery = Query & { readonly _tag: 'MisOrdenes'; readonly usuarioId: string }

export class MisOrdenesHandler implements QueryHandler<
  MisOrdenesQuery,
  EstadoOrdenResponse[],
  PaymentsError
> {
  readonly handles = 'MisOrdenes' as const

  constructor(private readonly ordenes: OrdenRepository) {}

  async execute(q: MisOrdenesQuery): Promise<Result<EstadoOrdenResponse[], PaymentsError>> {
    const lista = await this.ordenes.porUsuario(UniqueId.desde(q.usuarioId))
    return Ok(
      lista.map(o => ({
        ordenId: o.id.valor,
        cursoId: o.cursoId.valor,
        estado: o.estado,
        monto: o.monto.monto,
        moneda: o.monto.moneda,
        comision: o.comision?.monto ?? null,
        neto: o.neto?.monto ?? null,
      })),
    )
  }
}

export type ProyectarPrecioCommand = Command & {
  readonly _tag: 'ProyectarPrecio'
  readonly cursoId: string
  readonly titulo: string
  readonly monto: number
  readonly moneda: string
  readonly versionPrecio: number
  readonly publicado: boolean
}

/** Proyección de precios (D14): evita llamar a catalog en el checkout. */
export class ProyectarPrecioHandler implements CommandHandler<
  ProyectarPrecioCommand,
  { ok: true },
  PaymentsError
> {
  readonly handles = 'ProyectarPrecio' as const

  constructor(private readonly precios: PrecioProyeccionRepository) {}

  async execute(cmd: ProyectarPrecioCommand): Promise<Result<{ ok: true }, PaymentsError>> {
    await this.precios.guardar({
      cursoId: cmd.cursoId,
      titulo: cmd.titulo,
      monto: cmd.monto,
      moneda: cmd.moneda,
      versionPrecio: cmd.versionPrecio,
      publicado: cmd.publicado,
    })
    return Ok({ ok: true })
  }
}

export type DespublicarPrecioCommand = Command & {
  readonly _tag: 'DespublicarPrecio'
  readonly cursoId: string
}

export class DespublicarPrecioHandler implements CommandHandler<
  DespublicarPrecioCommand,
  { ok: true },
  PaymentsError
> {
  readonly handles = 'DespublicarPrecio' as const

  constructor(private readonly precios: PrecioProyeccionRepository) {}

  async execute(cmd: DespublicarPrecioCommand): Promise<Result<{ ok: true }, PaymentsError>> {
    await this.precios.marcarPublicado(cmd.cursoId, false)
    return Ok({ ok: true })
  }
}

export type ExpirarOrdenesCommand = Command & { readonly _tag: 'ExpirarOrdenes' }

/** Job del doc 09 §8: una orden PENDIENTE no vive para siempre. */
export class ExpirarOrdenesHandler implements CommandHandler<
  ExpirarOrdenesCommand,
  { expiradas: number },
  PaymentsError
> {
  readonly handles = 'ExpirarOrdenes' as const

  constructor(
    private readonly ordenes: OrdenRepository,
    private readonly ahora: () => Date,
  ) {}

  async execute(): Promise<Result<{ expiradas: number }, PaymentsError>> {
    const momento = this.ahora()
    const vencidas = await this.ordenes.vencidas(momento)
    let expiradas = 0
    for (const orden of vencidas) {
      if (orden.expirarSiCorresponde(momento)) {
        await this.ordenes.guardar(orden)
        expiradas += 1
      }
    }
    return Ok({ expiradas })
  }
}
