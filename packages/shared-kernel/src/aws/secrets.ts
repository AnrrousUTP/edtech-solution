import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'

const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { valor: Record<string, string>; expira: number }>()

export const crearSecretsClient = (config: {
  region: string
  endpoint?: string
}): SecretsManagerClient =>
  new SecretsManagerClient({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  })

/** Lee un secreto JSON de Secrets Manager, con caché en memoria de 5 minutos. */
export const leerSecreto = async (
  cliente: SecretsManagerClient,
  nombre: string,
): Promise<Record<string, string>> => {
  const ahora = Date.now()
  const enCache = cache.get(nombre)
  if (enCache && enCache.expira > ahora) return enCache.valor

  const r = await cliente.send(new GetSecretValueCommand({ SecretId: nombre }))
  if (!r.SecretString) throw new Error(`Secreto ${nombre} sin SecretString`)
  const valor = JSON.parse(r.SecretString) as Record<string, string>
  cache.set(nombre, { valor, expira: ahora + TTL_MS })
  return valor
}

/** Solo para tests. */
export const limpiarCacheSecretos = (): void => cache.clear()
