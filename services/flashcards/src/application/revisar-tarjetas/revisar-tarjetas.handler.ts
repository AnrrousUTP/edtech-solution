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
import { MazoNoEncontradoError, type FlashcardsError } from '../../domain/module.errors'
import type { MazoRepository } from '../../domain/ports-out/mazo.repository'

export type AprobarTarjetaCommand = Command & {
  readonly _tag: 'AprobarTarjeta'
  readonly mazoId: string
  readonly tarjetaId: string
  readonly revisorId: string
  readonly edicion?: { anverso: string; reverso: string }
}

export type RevisionResponse = { estadoMazo: string; publicadas: number }

/** HITL (doc 10 §6): aprobar es la ÚNICA vía para que una tarjeta llegue al
 *  estudiante. No hay bypass de admin ni flag de entorno. */
export class AprobarTarjetaHandler implements CommandHandler<
  AprobarTarjetaCommand,
  RevisionResponse,
  FlashcardsError
> {
  readonly handles = 'AprobarTarjeta' as const

  constructor(
    private readonly mazos: MazoRepository,
    private readonly publisher: IEventPublisher,
    private readonly reloj: Reloj,
  ) {}

  async execute(cmd: AprobarTarjetaCommand): Promise<Result<RevisionResponse, FlashcardsError>> {
    const mazo = await this.mazos.porId(UniqueId.desde(cmd.mazoId))
    if (!mazo) return Err(new MazoNoEncontradoError(cmd.mazoId))

    const r = mazo.aprobarTarjeta(cmd.tarjetaId, cmd.revisorId, this.reloj.ahora(), cmd.edicion)
    if (isErr(r)) return Err(r.error)

    await this.mazos.guardar(mazo)
    await this.publisher.publish(mazo.pullEvents())
    return Ok({
      estadoMazo: mazo.estado,
      publicadas: mazo.tarjetas.filter(t => t.estado === 'PUBLICADA').length,
    })
  }
}

export type RechazarTarjetaCommand = Command & {
  readonly _tag: 'RechazarTarjeta'
  readonly mazoId: string
  readonly tarjetaId: string
  readonly revisorId: string
  readonly motivo: string
}

export class RechazarTarjetaHandler implements CommandHandler<
  RechazarTarjetaCommand,
  RevisionResponse,
  FlashcardsError
> {
  readonly handles = 'RechazarTarjeta' as const

  constructor(
    private readonly mazos: MazoRepository,
    private readonly publisher: IEventPublisher,
    private readonly reloj: Reloj,
  ) {}

  async execute(cmd: RechazarTarjetaCommand): Promise<Result<RevisionResponse, FlashcardsError>> {
    const mazo = await this.mazos.porId(UniqueId.desde(cmd.mazoId))
    if (!mazo) return Err(new MazoNoEncontradoError(cmd.mazoId))

    const r = mazo.rechazarTarjeta(cmd.tarjetaId, cmd.revisorId, cmd.motivo, this.reloj.ahora())
    if (isErr(r)) return Err(r.error)

    await this.mazos.guardar(mazo)
    await this.publisher.publish(mazo.pullEvents())
    return Ok({
      estadoMazo: mazo.estado,
      publicadas: mazo.tarjetas.filter(t => t.estado === 'PUBLICADA').length,
    })
  }
}
