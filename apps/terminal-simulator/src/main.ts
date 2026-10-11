import mqtt from 'mqtt'
import {
  IoTDataPlaneClient,
  GetThingShadowCommand,
  PublishCommand,
} from '@aws-sdk/client-iot-data-plane'
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { log } from '@edtech/shared-kernel'
import { cargarConfig } from './infrastructure/config/config'
const cfg = cargarConfig()
const topic = `edtech/dev/terminals/${cfg.deviceId}`
const shadow = `$aws/things/${cfg.deviceId}/shadow/name/promotion`
type State = {
  version: number
  refId: string | null
  mensaje: string
  habilitado: boolean
  vistos: string[]
  ultimoAviso: string | null
}
let state: State = {
  version: 0,
  refId: null,
  mensaje: 'Esperando configuración',
  habilitado: false,
  vistos: [],
  ultimoAviso: null,
}
try {
  state = { ...state, ...JSON.parse(await readFile(cfg.stateFile, 'utf8')) }
} catch {
  /* primer arranque */
}
await mkdir(dirname(cfg.stateFile), { recursive: true })
let serial = Promise.resolve()
const guardar = async () => {
  await writeFile(`${cfg.stateFile}.tmp`, JSON.stringify(state))
  await rename(`${cfg.stateFile}.tmp`, cfg.stateFile)
}
if (cfg.iotEndpoint) {
  const cloud = new IoTDataPlaneClient({ region: cfg.region, endpoint: cfg.iotEndpoint })
  let stopping = false
  const detener = () => {
    stopping = true
  }
  process.on('SIGTERM', detener)
  process.on('SIGINT', detener)
  const acknowledgements = new Set<string>()
  log.info('simulador virtual conectado a AWS IoT Core por API firmada', { deviceId: cfg.deviceId })
  while (!stopping) {
    try {
      const result = await cloud.send(
        new GetThingShadowCommand({ thingName: cfg.deviceId, shadowName: 'promotion' }),
      )
      if (result.payload) {
        const document = JSON.parse(Buffer.from(result.payload).toString()) as {
          state?: {
            desired?: {
              configuration?: Record<string, unknown>
              alerts?: { id: string; texto: string }[]
            }
          }
        }
        const desired = document.state?.desired
        const c = desired?.configuration
        if (
          c &&
          Number.isSafeInteger(c.version) &&
          Number(c.version) >= state.version &&
          typeof c.mensaje === 'string' &&
          typeof c.habilitado === 'boolean'
        ) {
          state = {
            ...state,
            version: Number(c.version),
            refId: typeof c.refId === 'string' ? c.refId : null,
            mensaje: c.mensaje,
            habilitado: c.habilitado,
          }
          await guardar()
        }
        for (const alert of desired?.alerts ?? []) {
          if (typeof alert.id !== 'string' || typeof alert.texto !== 'string') continue
          if (!state.vistos.includes(alert.id)) {
            state.vistos = [...state.vistos.slice(-199), alert.id]
            state.ultimoAviso = alert.texto
            await guardar()
            log.info('aviso de nueva venta recibido por Shadow', { alertId: alert.id })
          }
          if (!acknowledgements.has(alert.id)) {
            await cloud.send(
              new PublishCommand({
                topic: `edtech/dev/terminals/${cfg.deviceId}/telemetry`,
                qos: 1,
                payload: Buffer.from(
                  JSON.stringify({
                    eventId: crypto.randomUUID(),
                    eventType: 'iot.telemetry.interno',
                    occurredAt: new Date().toISOString(),
                    aggregateId: cfg.deviceId,
                    correlationId: crypto.randomUUID(),
                    payload: { deviceId: cfg.deviceId, version: state.version, alertId: alert.id },
                  }),
                ),
              }),
            )
            acknowledgements.add(alert.id)
          }
        }
      }
      await cloud.send(
        new PublishCommand({
          topic: `edtech/dev/terminals/${cfg.deviceId}/telemetry`,
          qos: 1,
          payload: Buffer.from(
            JSON.stringify({
              eventId: crypto.randomUUID(),
              eventType: 'iot.telemetry.interno',
              occurredAt: new Date().toISOString(),
              aggregateId: cfg.deviceId,
              correlationId: crypto.randomUUID(),
              payload: { deviceId: cfg.deviceId, version: state.version },
            }),
          ),
        }),
      )
    } catch (error) {
      log.error('ciclo del terminal AWS', { error: String(error) })
    }
    await new Promise(resolve => setTimeout(resolve, cfg.heartbeatMs))
  }
  cloud.destroy()
  process.exit(0)
}
const client = mqtt.connect(cfg.mqttUrl, {
  clientId: cfg.deviceId,
  username: cfg.username,
  password: cfg.password,
  reconnectPeriod: 2000,
  clean: true,
})
const reportar = async (alertId?: string) => {
  if (client.connected)
    await client.publishAsync(
      `${topic}/${alertId ? 'ack' : 'telemetry'}`,
      JSON.stringify({ version: state.version, ...(alertId ? { alertId } : {}) }),
      { qos: 1 },
    )
}
client.on('connect', () => {
  log.info('terminal conectado', { deviceId: cfg.deviceId })
  void client
    .subscribeAsync([`${shadow}/update/delta`, `${topic}/alerts`], { qos: 1 })
    .then(() => client.publishAsync(`${shadow}/get`, '{}', { qos: 1 }))
    .then(() => reportar())
    .catch(error => log.error('inicio MQTT', { error: String(error) }))
})
client.on('error', error => log.error('terminal MQTT', { error: error.message }))
client.on('message', (channel, bytes) => {
  serial = serial
    .then(async () => {
      if (bytes.length > 4096) return
      const p = JSON.parse(bytes.toString()) as Record<string, unknown>
      if (channel === `${shadow}/update/delta`) {
        const c = p.state as Record<string, unknown>
        if (
          !c ||
          !Number.isSafeInteger(c.version) ||
          Number(c.version) < state.version ||
          typeof c.mensaje !== 'string' ||
          typeof c.habilitado !== 'boolean'
        )
          return
        state = {
          ...state,
          version: Number(c.version),
          refId: typeof c.refId === 'string' ? c.refId : null,
          mensaje: c.mensaje,
          habilitado: c.habilitado,
        }
        await guardar()
        await reportar()
        log.info('promoción aplicada', {
          deviceId: cfg.deviceId,
          version: state.version,
          habilitado: state.habilitado,
        })
      } else if (channel === `${topic}/alerts`) {
        if (typeof p.id !== 'string' || typeof p.texto !== 'string') return
        if (!state.vistos.includes(p.id)) {
          state.vistos = [...state.vistos.slice(-199), p.id]
          state.ultimoAviso = p.texto
          await guardar()
          log.info('aviso de nueva venta', { alertId: p.id })
        }
        await reportar(p.id)
      }
    })
    .catch(error => log.error('mensaje descartado', { error: String(error) }))
})
const heartbeat = setInterval(
  () => void reportar().catch(error => log.error('heartbeat pendiente', { error: String(error) })),
  cfg.heartbeatMs,
)
const apagar = async () => {
  clearInterval(heartbeat)
  await serial
  await client.endAsync()
  process.exit(0)
}
process.on('SIGTERM', () => void apagar())
process.on('SIGINT', () => void apagar())
