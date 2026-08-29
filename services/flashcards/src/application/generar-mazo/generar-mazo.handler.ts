import {
  Err,
  Ok,
  UniqueId,
  isErr,
  log,
  type Command,
  type CommandHandler,
  type IEventPublisher,
  type Reloj,
  type Result,
} from '@edtech/shared-kernel'
import { MazoNoEncontradoError, type FlashcardsError } from '../../domain/module.errors'
import type { ContenidoFuente } from '../../domain/ports-out/contenido-fuente.port'
import type { GeneradorFlashcardsPort } from '../../domain/ports-out/generador-flashcards.port'
import type { MazoRepository } from '../../domain/ports-out/mazo.repository'
import { validarTarjetas } from '../../domain/value-objects/salida-modelo.vo'

export type GenerarMazoCommand = Command & {
  readonly _tag: 'GenerarMazo'
  readonly mazoId: string
}

export type GenerarMazoResponse = { estado: string; tarjetas: number }

const CANTIDAD_DESEADA = 12

/** Worker de `sqs-flashcards-generacion` (doc 10 §1): invoca al generador, que
 *  puede tardar 30-90 s. Máximo 3 intentos por (tomo, hash) — doc 10 §7. */
export class GenerarMazoHandler implements CommandHandler<
  GenerarMazoCommand,
  GenerarMazoResponse,
  FlashcardsError
> {
  readonly handles = 'GenerarMazo' as const

  constructor(
    private readonly mazos: MazoRepository,
    private readonly generador: GeneradorFlashcardsPort,
    private readonly contenido: ContenidoFuente,
    private readonly publisher: IEventPublisher,
    private readonly reloj: Reloj,
    private readonly nuevoId: () => string = () => crypto.randomUUID(),
  ) {}

  async execute(cmd: GenerarMazoCommand): Promise<Result<GenerarMazoResponse, FlashcardsError>> {
    const mazo = await this.mazos.porId(UniqueId.desde(cmd.mazoId))
    if (!mazo) return Err(new MazoNoEncontradoError(cmd.mazoId))
    if (mazo.estado !== 'GENERANDO') {
      return Ok({ estado: mazo.estado, tarjetas: mazo.tarjetas.length }) // idempotente
    }

    mazo.registrarIntento()

    const lecciones: { titulo: string; contenido: string }[] = []
    for (const fuente of mazo.leccionesFuente) {
      const texto = await this.contenido.leer(fuente.bloquesS3Key).catch(err => {
        log.warn('no se pudo leer el contenido de la lección', {
          key: fuente.bloquesS3Key,
          error: err instanceof Error ? err.message : String(err),
        })
        return ''
      })
      lecciones.push({ titulo: fuente.titulo, contenido: texto })
    }

    const salida = await this.generador.generar({
      tomoTitulo: `Tomo ${mazo.tomoId}`,
      cursoTecnologia: 'programación',
      nivel: 'A',
      lecciones,
      cantidadDeseada: CANTIDAD_DESEADA,
    })

    if (isErr(salida)) {
      await this.#fallar(mazo, salida.error.message)
      return Ok({ estado: mazo.estado, tarjetas: 0 })
    }

    const validas = validarTarjetas(salida.value.tarjetas)
    if (isErr(validas)) {
      await this.#fallar(mazo, validas.error.message)
      return Ok({ estado: mazo.estado, tarjetas: 0 })
    }

    mazo.recibirTarjetas(validas.value, salida.value.modeloUsado, this.reloj.ahora(), this.nuevoId)
    await this.mazos.guardar(mazo)
    await this.publisher.publish(mazo.pullEvents())
    return Ok({ estado: mazo.estado, tarjetas: mazo.tarjetas.length })
  }

  async #fallar(
    mazo: Awaited<ReturnType<MazoRepository['porId']>> & object,
    motivo: string,
  ): Promise<void> {
    if (mazo.agotoIntentos) {
      mazo.marcarFallido(motivo)
      await this.mazos.guardar(mazo)
      await this.publisher.publish(mazo.pullEvents())
    } else {
      // Sigue en GENERANDO: el reintento de SQS vuelve a intentarlo
      await this.mazos.guardar(mazo)
    }
  }
}
