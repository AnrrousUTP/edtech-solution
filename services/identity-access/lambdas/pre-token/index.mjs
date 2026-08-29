// Lambda pre-token-generation (doc 08 §6): si el usuario está en el grupo admin
// y no tiene MFA configurado, el ID token sale con mfa_pendiente=true y el
// frontend lo manda a configurar MFA antes del panel. Mitigación parcial
// documentada: es un bloqueo de UI, no una barrera criptográfica.
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider'

const cognito = new CognitoIdentityProviderClient({})

export const handler = async (event) => {
  const grupos = event.request?.groupConfiguration?.groupsToOverride ?? []
  const claims = {}

  if (grupos.includes('admin')) {
    try {
      const usuario = await cognito.send(
        new AdminGetUserCommand({ UserPoolId: event.userPoolId, Username: event.userName }),
      )
      const tieneMfa = (usuario.UserMFASettingList ?? []).length > 0
      if (!tieneMfa) claims.mfa_pendiente = 'true'
    } catch (err) {
      console.error('pre-token: no se pudo consultar MFA', err)
    }
  }

  event.response = {
    claimsOverrideDetails: {
      claimsToAddOrOverride: claims,
    },
  }
  return event
}
