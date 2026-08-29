import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  type Message,
} from '@aws-sdk/client-sqs'
import { Err, Ok, type Result } from '../result.type'
import { conContexto } from '../http/request-context'
import { log } from '../logger'

// Sobre del doc 05 §3, tal como llega dentro del body del mensaje SQS.
export type SobreEvento = {
  eventId: string
  eventType: string
  occurredAt: string
  aggregateId: string
  correlationId: string
  payload: Record<string, unknown>
}

export class SobreInvalidoError extends Error {
  readonly code = 'SOBRE_INVALIDO'
}

/** El mensaje que EventBridge deja en SQS envuelve el Detail en su propio JSON. */
export const parseSobre = (body: string): Result<SobreEvento, SobreInvalidoError> => {
  try {
    const externo = JSON.parse(body)
    // Mensaje vía EventBridge → { detail: {...} }; mensaje directo a SQS → el sobre mismo.
    const sobre = externo.detail ?? externo
    if (
      typeof sobre.eventId !== 'string' ||
      typeof sobre.eventType !== 'string' ||
      typeof sobre.occurredAt !== 'string' ||
      typeof sobre.payload !== 'object' ||
      sobre.payload === null
    ) {
      return Err(new SobreInvalidoError(`Sobre sin forma válida: ${body.slice(0, 200)}`))
    }
    return Ok(sobre as SobreEvento)
  } catch {
    return Err(new SobreInvalidoError(`Body no es JSON: ${body.slice(0, 200)}`))
  }
}

export type ResultadoMensaje = 'ACK' | 'NACK'

export type PollerConfig = {
  queueUrl: string
  /** Procesa un mensaje ya parseado. ACK = borrar; NACK = dejar que SQS reintente. */
  procesar: (sobre: SobreEvento) => Promise<ResultadoMensaje>
  waitTimeSeconds?: number
  maxMensajes?: number
}

/** Poller genérico de SQS con long polling. La idempotencia por processed_events
 *  es responsabilidad del `procesar` de cada servicio (doc 05 §6). */
export class SqsPoller {
  #detenido = false

  constructor(
    private readonly cliente: SQSClient,
    private readonly config: PollerConfig,
  ) {}

  detener(): void {
    this.#detenido = true
  }

  async iniciar(): Promise<void> {
    log.info('poller SQS iniciado', { queueUrl: this.config.queueUrl })
    while (!this.#detenido) {
      try {
        await this.#ciclo()
      } catch (err) {
        log.error('fallo del ciclo de polling; se reintenta en 5s', {
          queueUrl: this.config.queueUrl,
          error: err instanceof Error ? err.message : String(err),
        })
        await Bun.sleep(5000)
      }
    }
  }

  async #ciclo(): Promise<void> {
    const r = await this.cliente.send(
      new ReceiveMessageCommand({
        QueueUrl: this.config.queueUrl,
        WaitTimeSeconds: this.config.waitTimeSeconds ?? 20,
        MaxNumberOfMessages: this.config.maxMensajes ?? 10,
      }),
    )
    for (const mensaje of r.Messages ?? []) {
      await this.#procesarMensaje(mensaje)
    }
  }

  async #procesarMensaje(mensaje: Message): Promise<void> {
    if (!mensaje.Body || !mensaje.ReceiptHandle) return
    const parseado = parseSobre(mensaje.Body)

    if (!parseado.ok) {
      // Sobre malformado: reintentar no lo arregla → se deja ir a DLQ vía redrive
      log.error('sobre inválido; el mensaje irá a DLQ por reintentos', {
        error: parseado.error.message,
      })
      return
    }

    const sobre = parseado.value
    const resultado = await conContexto({ correlationId: sobre.correlationId }, () =>
      this.config.procesar(sobre),
    )
    if (resultado === 'ACK') {
      await this.cliente.send(
        new DeleteMessageCommand({
          QueueUrl: this.config.queueUrl,
          ReceiptHandle: mensaje.ReceiptHandle,
        }),
      )
    }
    // NACK: no se borra; el visibility timeout vence y SQS reintenta (→ DLQ al 5º)
  }
}

export const crearSqsClient = (config: { region: string; endpoint?: string }): SQSClient =>
  new SQSClient({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  })
