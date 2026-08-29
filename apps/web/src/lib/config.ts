// Configuración del servidor. El access token NUNCA llega al navegador
// (doc 08 §7): estas variables se leen solo en Server Components y Route Handlers.
export const config = {
  apiBase: process.env.API_BASE ?? 'http://localhost:8080',
  /** Base pública para las llamadas del navegador (checkout con polling). */
  apiBasePublica: process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8080',
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  cognito: {
    dominio: process.env.COGNITO_DOMINIO ?? '',
    clientId: process.env.COGNITO_CLIENT_ID ?? '',
    /** Emisor local (jwt-local) cuando no hay Cognito: solo desarrollo. */
    issuerLocal: process.env.JWT_LOCAL_URL ?? '',
  },
}

export const hayCognito = (): boolean => Boolean(config.cognito.dominio && config.cognito.clientId)
