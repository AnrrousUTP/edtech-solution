'use client'

import { useEffect, useRef, useState } from 'react'
import type { MqttClient } from 'mqtt'

type IoTSession = {
  terminalId: string
  thingName: string
  clientId: string
  url: string
}
type Promotion = { version: number; refId: string | null; mensaje: string; habilitado: boolean }
type Alert = { id: string; texto: string }

export function TerminalIoT({
  terminalId,
  thingName,
  qrDataUrl,
  mensaje,
  habilitado,
  version,
}: {
  terminalId: string
  thingName: string
  qrDataUrl: string | null
  mensaje: string
  habilitado: boolean
  version: number
}): JSX.Element {
  const [status, setStatus] = useState('Desconectado')
  const [running, setRunning] = useState(false)
  const [promotion, setPromotion] = useState<Promotion>({
    version,
    refId: null,
    mensaje,
    habilitado,
  })
  const [alerts, setAlerts] = useState<Alert[]>([])
  const active = useRef(false)
  const client = useRef<MqttClient | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const seen = useRef(new Set<string>())
  const promotionRef = useRef(promotion)
  promotionRef.current = promotion

  useEffect(
    () => () => {
      active.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (renewTimer.current) clearTimeout(renewTimer.current)
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current)
      client.current?.end(true)
      client.current = null
    },
    [],
  )

  const connect = async (): Promise<void> => {
    if (!active.current) return
    setStatus('Solicitando acceso seguro…')
    try {
      const response = await fetch('/api/iot/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = (await response.json()) as IoTSession | { error?: string }
      if (!response.ok || !('url' in data)) {
        throw new Error('error' in data ? data.error : 'No se pudo autorizar la conexión.')
      }
      if (data.thingName !== thingName)
        throw new Error('El terminal recibido no coincide con la configuración.')
      if (!active.current) return

      setStatus('Conectando al terminal…')
      const mqtt = await import('mqtt')
      const mqttClient = mqtt.connect(data.url, {
        clientId: data.clientId,
        clean: true,
        connectTimeout: 10000,
        reconnectPeriod: 0,
        resubscribe: false,
        protocolVersion: 4,
      })
      client.current = mqttClient
      const shadow = `$aws/things/${data.thingName}/shadow/name/promotion`
      const topic = `edtech/lowcost/terminals/${data.thingName}`
      const report = (alertId?: string): void => {
        if (!mqttClient.connected || document.visibilityState !== 'visible') return
        mqttClient.publish(
          `${topic}/telemetry`,
          JSON.stringify({
            eventId: crypto.randomUUID(),
            eventType: 'iot.telemetry.interno',
            occurredAt: new Date().toISOString(),
            aggregateId: data.thingName,
            correlationId: crypto.randomUUID(),
            payload: {
              deviceId: data.thingName,
              version: promotionRef.current.version,
              ...(alertId ? { alertId } : {}),
            },
          }),
          { qos: 1 },
        )
      }

      mqttClient.on('connect', () => {
        setStatus('Terminal conectado')
        mqttClient.subscribe(
          [`${shadow}/get/accepted`, `${shadow}/update/delta`, `${topic}/alerts`],
          { qos: 1 },
          error => {
            if (error) {
              setStatus('No se pudieron suscribir los avisos')
              return
            }
            mqttClient.publish(`${shadow}/get`, '{}', { qos: 1 })
            report()
          },
        )
        if (heartbeatTimer.current) clearInterval(heartbeatTimer.current)
        heartbeatTimer.current = setInterval(() => report(), 60000)
        if (renewTimer.current) clearTimeout(renewTimer.current)
        renewTimer.current = setTimeout(
          () => {
            if (!active.current) return
            client.current = null
            mqttClient.end(true)
            void connect()
          },
          4 * 60 * 1000,
        )
      })
      mqttClient.on('message', (receivedTopic, bytes) => {
        if (bytes.length > 8192) return
        try {
          const payload = JSON.parse(bytes.toString()) as Record<string, unknown>
          const state = payload.state as Record<string, unknown> | undefined
          const desired = state?.desired as Record<string, unknown> | undefined
          const delta = state?.configuration as Record<string, unknown> | undefined
          const configuration = (desired?.configuration ?? delta) as
            Record<string, unknown> | undefined
          if (
            (receivedTopic === `${shadow}/get/accepted` ||
              receivedTopic === `${shadow}/update/delta`) &&
            configuration &&
            Number.isSafeInteger(configuration.version) &&
            typeof configuration.mensaje === 'string' &&
            typeof configuration.habilitado === 'boolean'
          ) {
            setPromotion({
              version: Number(configuration.version),
              refId: typeof configuration.refId === 'string' ? configuration.refId : null,
              mensaje: configuration.mensaje,
              habilitado: configuration.habilitado,
            })
            report()
          }
          if (
            receivedTopic === `${topic}/alerts` &&
            typeof payload.id === 'string' &&
            typeof payload.texto === 'string'
          ) {
            if (!seen.current.has(payload.id)) {
              seen.current.add(payload.id)
              setAlerts(items =>
                [{ id: payload.id as string, texto: payload.texto as string }, ...items].slice(
                  0,
                  5,
                ),
              )
            }
            report(payload.id)
          }
        } catch {
          setStatus('Se descartó un mensaje IoT inválido')
        }
      })
      mqttClient.on('error', () => setStatus('Conexión IoT con error'))
      mqttClient.on('close', () => {
        if (client.current !== mqttClient) return
        if (heartbeatTimer.current) clearInterval(heartbeatTimer.current)
        client.current = null
        if (!active.current) return
        setStatus('Reconectando…')
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
        reconnectTimer.current = setTimeout(() => void connect(), 5000)
      })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo conectar el terminal.')
      if (active.current) {
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
        reconnectTimer.current = setTimeout(() => void connect(), 10000)
      }
    }
  }

  const toggle = (): void => {
    if (active.current) {
      active.current = false
      setRunning(false)
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (renewTimer.current) clearTimeout(renewTimer.current)
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current)
      const current = client.current
      client.current = null
      current?.end(true)
      setStatus('Desconectado')
      return
    }
    active.current = true
    setRunning(true)
    void connect()
  }

  return (
    <div className="affiliate-terminal-summary affiliate-iot-terminal">
      <div className="affiliate-iot-header">
        <div>
          <h3>Terminal virtual conectado a IoT Core</h3>
          <p>El navegador emula el dispositivo. Heartbeat cada 60 segundos y conexión temporal.</p>
        </div>
        <button className="boton-secundario" type="button" onClick={toggle}>
          {running ? 'Desconectar' : 'Conectar terminal'}
        </button>
      </div>
      <p className="affiliate-iot-status" role="status">
        {status}
      </p>
      {client.current && (
        <div className="affiliate-display" aria-live="polite">
          <p className="affiliate-eyebrow">Una nueva habilidad empieza aquí</p>
          <h1>{promotion.mensaje}</h1>
          {promotion.habilitado && qrDataUrl ? (
            <img src={qrDataUrl} alt="QR de la promoción EdTech" width={240} height={240} />
          ) : (
            <p>La promoción está pausada o todavía se está sincronizando.</p>
          )}
          <div className="affiliate-status">
            <span className="etiqueta tech-badge-neutral">
              Versión aplicada {promotion.version}
            </span>
            <span className="etiqueta tech-badge-neutral">{terminalId.slice(0, 8)}</span>
          </div>
        </div>
      )}
      {alerts.length > 0 && (
        <ul className="affiliate-iot-alerts" aria-label="Avisos recientes del terminal">
          {alerts.map(alert => (
            <li key={alert.id}>{alert.texto}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
