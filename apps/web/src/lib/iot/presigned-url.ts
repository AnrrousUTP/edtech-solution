import { Hash } from '@smithy/hash-node'
import { SignatureV4 } from '@smithy/signature-v4'

export type TemporaryCredentials = {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
}

/** Firma el handshake WSS usando únicamente credenciales temporales del terminal. */
export const crearUrlMqttFirmada = async (options: {
  endpoint: string
  region: string
  credentials: TemporaryCredentials
  now?: Date
}): Promise<string> => {
  const hostname = options.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!/^[a-z0-9.-]+$/i.test(hostname)) throw new Error('Endpoint IoT inválido')

  // AWS IoT requiere que el token de sesión temporal se añada después de firmar
  // los parámetros SigV4. Por eso el signer recibe solo accessKeyId y secret.
  const signer = new SignatureV4({
    credentials: {
      accessKeyId: options.credentials.accessKeyId,
      secretAccessKey: options.credentials.secretAccessKey,
    },
    region: options.region,
    service: 'iotdevicegateway',
    sha256: Hash.bind(null, 'sha256'),
  })
  const request = {
    protocol: 'https:',
    hostname,
    method: 'GET',
    path: '/mqtt',
    headers: { host: hostname },
  } as Parameters<typeof signer.presign>[0]
  const signed = await signer.presign(request, {
    expiresIn: 300,
    ...(options.now ? { signingDate: options.now } : {}),
  })
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(signed.query ?? {})) {
    if (Array.isArray(value)) for (const item of value) query.append(name, item)
    else if (value !== undefined) query.append(name, String(value))
  }
  // This parameter is deliberately appended only after SigV4 has produced its
  // signature, as required for AWS IoT WSS with temporary STS credentials.
  query.append('X-Amz-Security-Token', options.credentials.sessionToken)
  return `wss://${hostname}/mqtt?${query.toString()}`
}
