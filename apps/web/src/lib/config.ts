// Configuración del servidor. El access token NUNCA llega al navegador
// (doc 08 §7): estas variables se leen solo en Server Components y Route Handlers.
export const config = {
  affiliatesEnabled: process.env.EDTECH_AFFILIATES_ENABLED === 'true',
  apiBase: process.env.API_BASE ?? 'http://localhost:8080',
  /** En local puede apuntar al gateway mientras Catálogo corre directo en otro puerto. */
  servicesApiBase:
    process.env.EDTECH_SERVICES_API_BASE ?? process.env.API_BASE ?? 'http://localhost:8080',
  /** Base directa del catálogo cuando Anrrous Dev expone ese servicio fuera del gateway. */
  catalogApiBase:
    process.env.EDTECH_SERVICES_API_BASE ?? process.env.API_BASE ?? 'http://localhost:8080',
  /** Base pública para las llamadas del navegador (checkout con polling). */
  apiBasePublica: process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8080',
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  cognito: {
    region: process.env.COGNITO_REGION ?? 'us-east-1',
    dominio: process.env.COGNITO_DOMINIO ?? '',
    clientId: process.env.COGNITO_CLIENT_ID ?? '',
    /** Emisor local (jwt-local) cuando no hay Cognito: solo desarrollo. */
    issuerLocal: process.env.JWT_LOCAL_URL ?? '',
    localAuthEnabled: process.env.EDTECH_LOCAL_AUTH === 'true',
  },
  assistant: {
    bedrockModelId: process.env.BEDROCK_MODEL_ID ?? 'amazon.nova-micro-v1:0',
    enabled: process.env.EDTECH_AI_ENABLED === 'true',
    controlTable: process.env.EDTECH_CONTROL_TABLE ?? '',
    audioBucket: process.env.EDTECH_AUDIO_BUCKET ?? '',
    production: process.env.NODE_ENV === 'production',
  },
  iot: {
    enabled: process.env.EDTECH_IOT_ENABLED === 'true',
    endpoint: process.env.EDTECH_IOT_DATA_ENDPOINT ?? '',
    sessionRoleArn: process.env.EDTECH_IOT_SESSION_ROLE_ARN ?? '',
    thingName: process.env.EDTECH_IOT_THING_NAME ?? 'terminal-demo-01',
  },
}

export const hayCognito = (): boolean => Boolean(config.cognito.dominio && config.cognito.clientId)
export const authLocalDisponible = (): boolean =>
  Boolean(config.cognito.issuerLocal && config.cognito.localAuthEnabled)

export const destinoInterno = (
  valor: string | null | undefined,
  fallback = '/dashboard',
): string => {
  if (!valor || !valor.startsWith('/') || valor.startsWith('//') || valor.includes('\\'))
    return fallback
  return valor
}
