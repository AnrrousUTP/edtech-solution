import type { NextFunction, Request, Response } from 'express'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { asignarIdentidad } from './request-context'

// Validación del access token de Cognito (doc 08 §5). El mismo código valida
// contra el emisor local (jwt-local) y contra el User Pool real: solo cambia
// COGNITO_ISSUER.
type AuthConfig = {
  issuer: string
  /** Uno o varios client_id separados por coma: en dev conviven el cliente web
   *  y el de pruebas (el que usa tools/e2e.ts contra AWS). Vacío = no se revisa. */
  clientId?: string
  /** Solo para tests desde el host contra jwt-local: el issuer lógico del token
   *  y la URL física del JWKS pueden diferir (localhost vs nombre del compose). */
  jwksUri?: string
}

type Middleware = (req: Request, res: Response, next: NextFunction) => void

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
let jwksIssuer = ''

const obtenerJwks = (issuer: string, jwksUri?: string) => {
  const uri = jwksUri ?? `${issuer}/.well-known/jwks.json`
  // jose cachea las claves y las refresca solo; recrear el set únicamente si cambia la URI
  if (!jwks || jwksIssuer !== uri) {
    jwks = createRemoteJWKSet(new URL(uri))
    jwksIssuer = uri
  }
  return jwks
}

/**
 * En dev conviven varios clientes legítimos del mismo pool (el web y el de
 * pruebas), así que la config admite una lista separada por comas. Vacía = no
 * se revisa el client_id, que es lo correcto cuando el emisor es el local.
 */
export const clientIdPermitido = (configurados: string | undefined, delToken: unknown): boolean => {
  const permitidos = (configurados ?? '')
    .split(',')
    .map(c => c.trim())
    .filter(c => c !== '')
  return permitidos.length === 0 || permitidos.includes(String(delToken))
}

const noAutorizado = (res: Response, message: string): void => {
  res.status(401).json({ error: { code: 'NO_AUTORIZADO', message } })
}

declare global {
  namespace Express {
    interface Request {
      auth?: {
        usuarioId: string
        roles: string[]
        email?: string
        nombreVisible?: string
        mfaPendiente?: boolean
      }
    }
  }
}

export const requiereAuth = (config: AuthConfig): Middleware => {
  return (req, res, next) => {
    const cabecera = req.headers.authorization
    if (!cabecera?.startsWith('Bearer ')) return noAutorizado(res, 'Falta el token')
    const token = cabecera.slice('Bearer '.length)

    jwtVerify(token, obtenerJwks(config.issuer, config.jwksUri), {
      issuer: config.issuer,
      clockTolerance: 60,
    })
      .then(({ payload }) => {
        // El error clásico: aceptar el id token. Se exige token_use = 'access'.
        if (payload.token_use !== 'access') return noAutorizado(res, 'Se requiere un access token')
        if (!clientIdPermitido(config.clientId, payload.client_id))
          return noAutorizado(res, 'client_id no reconocido')
        if (typeof payload.sub !== 'string') return noAutorizado(res, 'Token sin sub')

        const roles = rolesAplicacionDeGrupos(payload['cognito:groups'])
        const email = typeof payload.email === 'string' ? payload.email : undefined
        const nombreVisible =
          typeof payload.name === 'string'
            ? payload.name
            : typeof payload.nombre_visible === 'string'
              ? payload.nombre_visible
              : undefined
        req.auth = {
          usuarioId: payload.sub,
          roles,
          mfaPendiente: payload.mfa_pendiente === 'true' || payload.mfa_pendiente === true,
          ...(email ? { email } : {}),
          ...(nombreVisible ? { nombreVisible } : {}),
        }
        asignarIdentidad(payload.sub, roles)
        next()
      })
      .catch(() => noAutorizado(res, 'Token inválido o expirado'))
  }
}

export const requiereRol = (rol: 'estudiante' | 'docente' | 'afiliado'): Middleware => {
  return (req, res, next) => {
    if (!req.auth) return noAutorizado(res, 'Falta el token')
    if (req.auth.roles.length !== 1) {
      res
        .status(403)
        .json({ error: { code: 'ROL_INVALIDO', message: 'La cuenta debe tener un solo rol' } })
      return
    }
    if (req.auth.roles[0] !== rol) {
      res.status(403).json({ error: { code: 'ROL_INSUFICIENTE', message: `Requiere rol ${rol}` } })
      return
    }
    if (rol === 'docente' && req.auth.mfaPendiente) {
      res.status(403).json({
        error: { code: 'MFA_REQUERIDO', message: 'Configura MFA antes de acceder al área docente' },
      })
      return
    }
    next()
  }
}

export const rolesAplicacionDeGrupos = (grupos: unknown): string[] => {
  if (!Array.isArray(grupos)) return []
  const normalizados = new Set(
    grupos
      .filter((grupo): grupo is string => typeof grupo === 'string')
      .map(grupo => {
        const normalizado = grupo.toLowerCase()
        return normalizado === 'admin' ? 'docente' : normalizado
      }),
  )
  const roles = ['docente', 'afiliado', 'estudiante'].filter(grupo => normalizados.has(grupo))
  return roles.length === 1 ? roles : []
}
