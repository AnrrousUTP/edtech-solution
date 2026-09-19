// Configuración del servidor. El access token NUNCA llega al navegador
// (doc 08 §7): estas variables se leen solo en Server Components y Route Handlers.
export const config = {
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
    openAiApiKey: process.env.OPENAI_API_KEY ?? '',
    openAiModel: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? '',
    elevenLabsSttModel: process.env.ELEVENLABS_STT_MODEL ?? 'scribe_v2',
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
