export const cargarConfig = () => {
  const env = process.env
  return {
    mqttUrl: env.MQTT_URL ?? 'mqtt://mqtt:1883',
    iotEndpoint: env.IOT_DATA_ENDPOINT,
    region: env.AWS_REGION ?? 'us-east-1',
    username: env.MQTT_USERNAME ?? 'terminal-demo-01',
    password: env.MQTT_PASSWORD ?? '',
    deviceId: env.IOT_DEVICE_ID ?? 'terminal-demo-01',
    heartbeatMs: Number(env.IOT_HEARTBEAT_MS ?? 30000),
    stateFile: env.IOT_STATE_FILE ?? '/data/state.json',
  }
}
