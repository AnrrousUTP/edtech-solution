import { config } from './config'

const ENDPOINT = `https://cognito-idp.${config.cognito.region}.amazonaws.com/`

export class CognitoAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'CognitoAuthError'
  }
}

const llamar = async <T>(operacion: string, cuerpo: Record<string, unknown>): Promise<T> => {
  const respuesta = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${operacion}`,
    },
    body: JSON.stringify(cuerpo),
    cache: 'no-store',
  })
  const texto = await respuesta.text()
  const datos = (texto ? JSON.parse(texto) : {}) as Record<string, unknown>
  if (!respuesta.ok) {
    const codigo =
      String(datos.__type ?? datos.code ?? 'CognitoError')
        .split('#')
        .at(-1) ?? 'CognitoError'
    throw new CognitoAuthError(codigo, String(datos.message ?? 'No se pudo autenticar'))
  }
  return datos as T
}

const cliente = (): { ClientId: string } => {
  if (!config.cognito.clientId)
    throw new CognitoAuthError('ConfigurationError', 'Autenticación no configurada')
  return { ClientId: config.cognito.clientId }
}

export const registrarEnCognito = async (nombre: string, email: string, password: string) =>
  llamar<{ UserConfirmed?: boolean }>('SignUp', {
    ...cliente(),
    Username: email,
    Password: password,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'custom:nombre_visible', Value: nombre },
    ],
  })

export const confirmarEnCognito = async (email: string, codigo: string) =>
  llamar('ConfirmSignUp', { ...cliente(), Username: email, ConfirmationCode: codigo })

export const iniciarSesionCognito = async (email: string, password: string) =>
  llamar<{
    AuthenticationResult?: {
      AccessToken?: string
      IdToken?: string
      RefreshToken?: string
      ExpiresIn?: number
    }
    ChallengeName?: string
    Session?: string
  }>('InitiateAuth', {
    ...cliente(),
    AuthFlow: 'USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: email, PASSWORD: password },
  })

export const responderRetoCognito = async (
  email: string,
  session: string,
  challengeName: string,
  codigo?: string,
  nuevaPassword?: string,
) => {
  const challengeResponses: Record<string, string> = { USERNAME: email }
  if (challengeName === 'SOFTWARE_TOKEN_MFA')
    challengeResponses.SOFTWARE_TOKEN_MFA_CODE = codigo ?? ''
  if (challengeName === 'NEW_PASSWORD_REQUIRED')
    challengeResponses.NEW_PASSWORD = nuevaPassword ?? ''
  return llamar<{
    AuthenticationResult?: {
      AccessToken?: string
      IdToken?: string
      RefreshToken?: string
      ExpiresIn?: number
    }
    ChallengeName?: string
    Session?: string
  }>('RespondToAuthChallenge', {
    ...cliente(),
    ChallengeName: challengeName,
    Session: session,
    ChallengeResponses: challengeResponses,
  })
}

export const solicitarResetCognito = async (email: string) =>
  llamar('ForgotPassword', { ...cliente(), Username: email })

export const confirmarResetCognito = async (email: string, codigo: string, password: string) =>
  llamar('ConfirmForgotPassword', {
    ...cliente(),
    Username: email,
    ConfirmationCode: codigo,
    Password: password,
  })
