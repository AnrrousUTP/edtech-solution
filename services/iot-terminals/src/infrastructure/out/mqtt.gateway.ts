import mqtt from 'mqtt'
import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { crearSqsClient, log } from '@edtech/shared-kernel'
import type { Config } from '../config/config'
import type { TerminalRepository } from '../../domain/ports-out/terminal.repository'
/** Emulación local de IoT Rules y Shadow; no valida permisos de AWS. */
export class LocalIoTGateway {
  get connected(): boolean {
    return this.client.connected
  }
  readonly client
  private ocupado = false
  private version = -1
  private readonly shadow
  private readonly topic
  private readonly sqs
  constructor(
    private readonly cfg: Config,
    private readonly repo: TerminalRepository,
  ) {
    this.shadow = `$aws/things/${cfg.deviceId}/shadow/name/promotion`
    this.topic = `edtech/dev/terminals/${cfg.deviceId}`
    this.sqs = crearSqsClient({ region: cfg.region, endpoint: cfg.awsEndpoint })
    this.client = mqtt.connect(cfg.mqttUrl, {
      clientId: 'edtech-local-iot-bridge',
      username: cfg.mqttUser,
      password: cfg.mqttPassword,
      reconnectPeriod: 2000,
    })
    this.client.on('connect', () => {
      this.version = -1
      this.client.subscribe(
        [`${this.topic}/telemetry`, `${this.topic}/ack`, `${this.shadow}/get`],
        { qos: 1 },
      )
      void this.flush()
    })
    this.client.on('error', e => log.error('conexión MQTT del puente', { error: e.message }))
    this.client.on('message', (topic, bytes) => {
      void this.recibir(topic, bytes).catch(error =>
        log.error('telemetría pendiente', { error: String(error) }),
      )
    })
  }
  private async recibir(topic: string, bytes: Buffer): Promise<void> {
    if (topic === `${this.shadow}/get`) {
      this.version = -1
      await this.flush()
      return
    }
    if (bytes.length > 4096 || !this.cfg.colaTelemetry) return
    const p = JSON.parse(bytes.toString()) as Record<string, unknown>
    if (!Number.isSafeInteger(p.version) || Number(p.version) < 0) return
    const alertId =
      typeof p.alertId === 'string' && /^[0-9a-f-]{36}$/.test(p.alertId) ? p.alertId : undefined
    await this.sqs.send(
      new SendMessageCommand({
        QueueUrl: this.cfg.colaTelemetry,
        MessageBody: JSON.stringify({
          eventId: crypto.randomUUID(),
          eventType: 'iot.telemetry.interno',
          occurredAt: new Date().toISOString(),
          aggregateId: this.cfg.deviceId,
          correlationId: crypto.randomUUID(),
          payload: {
            deviceId: this.cfg.deviceId,
            version: Number(p.version),
            ...(alertId ? { alertId } : {}),
          },
        }),
      }),
    )
  }
  async flush(): Promise<void> {
    if (this.ocupado || !this.client.connected) return
    this.ocupado = true
    try {
      const c = await this.repo.configuracion()
      if (this.version !== c.version) {
        await this.client.publishAsync(
          `${this.shadow}/update/delta`,
          JSON.stringify({ version: c.version, state: c }),
          { qos: 1, retain: true },
        )
        this.version = c.version
      }
      for (const a of await this.repo.alertas())
        await this.client.publishAsync(`${this.topic}/alerts`, JSON.stringify(a), { qos: 1 })
    } catch (error) {
      log.error('IoT pendiente de reintento', { error: String(error) })
    } finally {
      this.ocupado = false
    }
  }
  async cerrar(): Promise<void> {
    await this.client.endAsync()
  }
}
