export const cargarConfig = () => {
  const env = process.env
  return {
    puerto: Number(env.PORT ?? 3000),
    dbUrl: env.DATABASE_URL,
    region: env.AWS_REGION ?? 'us-east-1',
    dynamoTable: env.DYNAMODB_TABLE,
    awsEndpoint: env.AWS_ENDPOINT_URL,
    iotEndpoint: env.IOT_DATA_ENDPOINT,
    iotTopicPrefix: env.IOT_TOPIC_PREFIX ?? 'edtech/dev',
    dbHost: env.DB_HOST,
    dbUser: env.DB_USER ?? 'svc_iot_terminals',
    cola: env.QUEUE_URL,
    colaTelemetry: env.TELEMETRY_QUEUE_URL,
    mqttUrl: env.MQTT_URL ?? 'mqtt://mqtt:1883',
    mqttUser: env.MQTT_USERNAME ?? 'bridge',
    mqttPassword: env.MQTT_PASSWORD ?? '',
    deviceId: env.IOT_DEVICE_ID ?? 'terminal-demo-01',
    offlineMs: Number(env.IOT_OFFLINE_MS ?? 90000),
    issuer: env.COGNITO_ISSUER ?? 'http://jwt-local:4599',
    clientId: env.COGNITO_CLIENT_ID,
    jwksUri: env.COGNITO_JWKS_URI,
  }
}
export type Config = ReturnType<typeof cargarConfig>
