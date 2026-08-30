import { config } from './config'

// Las tres operaciones de MFA de Cognito se hablan por HTTPS directo, sin el SDK
// de AWS. Motivo: las tres van firmadas con el ACCESS TOKEN del propio usuario,
// no con credenciales IAM, así que el SDK no aporta nada y sí agrega megabytes a
// la imagen del frontend (que se construye aislado, A-40). Es el mismo criterio
// que se usó con X-Ray en el kernel (A-45): hablar el protocolo cuando el
// protocolo es simple.
//
// Estas llamadas SOLO ocurren en Route Handlers del servidor: el access token
// nunca llega al navegador (doc 08 §7).

const ENDPOINT = `https://cognito-idp.${config.cognito.region}.amazonaws.com/`

const llamar = async <T>(operacion: string, cuerpo: Record<string, unknown>): Promise<T> => {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${operacion}`,
    },
    body: JSON.stringify(cuerpo),
  })
  const texto = await r.text()
  if (!r.ok) {
    const detalle = (JSON.parse(texto) as { message?: string }).message ?? texto
    throw new Error(detalle)
  }
  return JSON.parse(texto) as T
}

/** Genera el secreto TOTP del usuario. Devuelve el secreto y el URI `otpauth://`
 *  que las apps de autenticación entienden. */
export const asociarTotp = async (
  accessToken: string,
  email: string,
): Promise<{ secreto: string; uri: string }> => {
  const { SecretCode } = await llamar<{ SecretCode: string }>('AssociateSoftwareToken', {
    AccessToken: accessToken,
  })
  const emisor = encodeURIComponent('EdTech Solution')
  const cuenta = encodeURIComponent(email)
  return {
    secreto: SecretCode,
    uri: `otpauth://totp/${emisor}:${cuenta}?secret=${SecretCode}&issuer=${emisor}`,
  }
}

/** Verifica el primer código y deja TOTP como MFA preferido. A partir de acá
 *  Cognito exige el segundo factor en cada login. */
export const confirmarTotp = async (accessToken: string, codigo: string): Promise<void> => {
  const { Status } = await llamar<{ Status: string }>('VerifySoftwareToken', {
    AccessToken: accessToken,
    UserCode: codigo,
    FriendlyDeviceName: 'EdTech',
  })
  if (Status !== 'SUCCESS') throw new Error('Cognito no aceptó el código')

  await llamar('SetUserMFAPreference', {
    AccessToken: accessToken,
    SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
  })
}
