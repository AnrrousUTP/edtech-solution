// Lambda pre-token-generation (doc 08 §6): si el usuario está en el grupo docente
// y no tiene MFA configurado, los tokens ID y access llevan mfa_pendiente=true.
// El frontend lo guía a configurar MFA y las APIs bloquean el access token.
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider'

const cognito = new CognitoIdentityProviderClient({})

export const handler = async (event) => {
  const configuracion = event.request?.groupConfiguration ?? {}
  const grupos = configuracion.groupsToOverride ?? []
  const claimsId = {}
  const claimsAccess = {}
  const rolesValidos = new Set(['docente', 'afiliado', 'estudiante'])
  const normalizarRol = (grupo) => {
    if (typeof grupo !== 'string') return null
    const normalizado = grupo.toLowerCase()
    // Compatibilidad con el grupo legado: el rol de administración ahora es docente.
    if (normalizado === 'admin') return 'docente'
    return rolesValidos.has(normalizado) ? normalizado : null
  }
  const gruposRol = [...new Set(grupos.map(normalizarRol).filter(Boolean))]
  const rol = gruposRol.length === 1 ? gruposRol[0] : null
  let usuario = null

  if (rol === 'docente') {
    try {
      usuario = await cognito.send(
        new AdminGetUserCommand({ UserPoolId: event.userPoolId, Username: event.userName }),
      )
    } catch (err) {
      console.error('pre-token: no se pudo consultar el perfil Cognito', err)
    }
  }

  if (rol === 'docente') {
    const tieneMfa = (usuario?.UserMFASettingList ?? []).length > 0
    if (!tieneMfa) {
      claimsId.mfa_pendiente = 'true'
      claimsAccess.mfa_pendiente = 'true'
    }
  }

  event.response = {
    claimsAndScopeOverrideDetails: {
      idTokenGeneration: { claimsToAddOrOverride: claimsId },
      accessTokenGeneration: { claimsToAddOrOverride: claimsAccess },
      // El token concede exactamente un rol de aplicación, aunque un grupo
      // antiguo tenga una membresía duplicada en Cognito.
      groupOverrideDetails: {
        groupsToOverride: rol ? [rol] : [],
        iamRolesToOverride: configuracion.iamRolesToOverride ?? [],
        ...(configuracion.preferredRole ? { preferredRole: configuracion.preferredRole } : {}),
      },
    },
  }
  return event
}
