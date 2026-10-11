import {
  IoTDataPlaneClient,
  PublishCommand,
  UpdateThingShadowCommand,
} from '@aws-sdk/client-iot-data-plane'
import { log } from '@edtech/shared-kernel'
import type { Config } from '../config/config'
import type { TerminalRepository } from '../../domain/ports-out/terminal.repository'

/** Adaptador cloud: configura el Shadow del terminal y publica avisos en IoT Core. */
export class AwsIoTGateway {
  readonly connected = true // AWS IoT Data Plane usa HTTPS firmado por el rol de tarea.
  private readonly client: IoTDataPlaneClient
  private version = -1
  private alertHash = ''
  private readonly publicados = new Set<string>()
  private ocupado = false

  constructor(
    private readonly cfg: Config,
    private readonly repo: TerminalRepository,
  ) {
    if (!cfg.iotEndpoint) throw new Error('Falta IOT_DATA_ENDPOINT')
    this.client = new IoTDataPlaneClient({ region: cfg.region, endpoint: cfg.iotEndpoint })
  }

  async flush(): Promise<void> {
    if (this.ocupado) return
    this.ocupado = true
    try {
      const [config, alertas] = await Promise.all([this.repo.configuracion(), this.repo.alertas()])
      const alertHash = JSON.stringify(alertas)
      if (config.version !== this.version || alertHash !== this.alertHash) {
        await this.client.send(
          new UpdateThingShadowCommand({
            thingName: this.cfg.deviceId,
            shadowName: 'promotion',
            payload: Buffer.from(
              JSON.stringify({
                state: { desired: { configuration: config, alerts: alertas } },
              }),
            ),
          }),
        )
        this.version = config.version
        this.alertHash = alertHash
      }
      for (const alert of alertas) {
        if (this.publicados.has(alert.id)) continue
        await this.client.send(
          new PublishCommand({
            topic: `edtech/dev/terminals/${this.cfg.deviceId}/alerts`,
            qos: 1,
            payload: Buffer.from(JSON.stringify(alert)),
          }),
        )
        this.publicados.add(alert.id)
      }
    } catch (error) {
      log.error('IoT Core pendiente de reintento', { error: String(error) })
    } finally {
      this.ocupado = false
    }
  }

  async cerrar(): Promise<void> {
    this.client.destroy()
  }
}
