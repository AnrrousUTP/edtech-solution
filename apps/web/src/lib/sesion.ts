import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { config, hayCognito } from './config'

// Los tokens viven en cookies httpOnly + Secure + SameSite=Lax, escritas por el
// Route Handler del callback (doc 08 §7). NO en localStorage: cualquier XSS se
// llevaría el token. Los Server Components leen la cookie y llaman a las APIs
// con Authorization: Bearer — el navegador nunca ve el access token.
export const COOKIE_ACCESO = 'edtech_access'
export const COOKIE_REFRESH = 'edtech_refresh'
export const COOKIE_PERFIL = 'edtech_perfil' // datos de UI, httpOnly; el rol se valida con el JWT

export type RolAplicacion = 'estudiante' | 'docente' | 'afiliado'

export type PerfilSesion = {
  usuarioId: string
  email: string
  nombre: string
  rol: RolAplicacion
  /** Compatibilidad con componentes existentes; siempre contiene un solo rol. */
  roles: RolAplicacion[]
  /** Lo pone pre_token_generation en ID y access token si el docente no tiene TOTP (doc 08 §6). */
  mfaPendiente?: boolean
}

export const accessToken = async (): Promise<string | null> => {
  const almacen = await cookies()
  return almacen.get(COOKIE_ACCESO)?.value ?? null
}

let jwksUriEnCache = ''
let jwksEnCache: ReturnType<typeof createRemoteJWKSet> | null = null

const claimsAccesoVerificados = async (token: string): Promise<JWTPayload | null> => {
  const issuer = hayCognito() ? config.cognito.issuer : config.cognito.issuerLocal
  if (!issuer) return null

  const jwksUri = `${issuer.replace(/\/$/, '')}/.well-known/jwks.json`
  if (!jwksEnCache || jwksUriEnCache !== jwksUri) {
    jwksEnCache = createRemoteJWKSet(new URL(jwksUri))
    jwksUriEnCache = jwksUri
  }

  try {
    const { payload } = await jwtVerify(token, jwksEnCache, { issuer, clockTolerance: 60 })
    if (payload.token_use !== 'access' || typeof payload.sub !== 'string') return null
    if (hayCognito() && payload.client_id !== config.cognito.clientId) return null
    return payload
  } catch {
    return null
  }
}

export const rolDeGrupos = (valor: unknown): RolAplicacion | null => {
  if (!Array.isArray(valor)) return null
  const roles = [
    ...new Set(
      valor
        .filter((item): item is string => typeof item === 'string')
        .map(grupo => {
          const normalizado = grupo.toLowerCase()
          return normalizado === 'admin' ? 'docente' : normalizado
        })
        .filter((grupo): grupo is RolAplicacion =>
          ['estudiante', 'docente', 'afiliado'].includes(grupo),
        ),
    ),
  ]
  // Una sesión solo es válida si el token identifica exactamente un rol.
  // No elegir por prioridad evita que membresías heredadas se conviertan en
  // permisos ambiguos en la interfaz.
  return roles.length === 1 ? (roles[0] ?? null) : null
}

export const perfilSesion = async (): Promise<PerfilSesion | null> => {
  const almacen = await cookies()
  const bruto = almacen.get(COOKIE_PERFIL)?.value
  const token = almacen.get(COOKIE_ACCESO)?.value
  if (!bruto || !token) return null
  try {
    const guardado = JSON.parse(decodeURIComponent(bruto)) as Partial<PerfilSesion>
    const claims = await claimsAccesoVerificados(token)
    const rol = rolDeGrupos(claims?.['cognito:groups'])
    if (!claims || !rol || typeof claims.sub !== 'string' || claims.sub !== guardado.usuarioId)
      return null
    return {
      usuarioId: claims.sub,
      email: typeof guardado.email === 'string' ? guardado.email : '',
      nombre: typeof guardado.nombre === 'string' ? guardado.nombre : 'Usuario',
      rol,
      roles: [rol],
      mfaPendiente:
        rol === 'docente' && (claims.mfa_pendiente === 'true' || claims.mfa_pendiente === true),
    }
  } catch {
    return null
  }
}

export const esDocente = async (): Promise<boolean> => {
  const perfil = await perfilSesion()
  return perfil?.rol === 'docente'
}

export const exigirRol = async (
  rolRequerido: RolAplicacion,
  destino = '/',
): Promise<PerfilSesion> => {
  const perfil = await perfilSesion()
  if (!perfil) redirect(`/login?destino=${encodeURIComponent(destino)}`)
  if (perfil.rol !== rolRequerido) redirect(rutaInicioPorRol(perfil.rol))
  return perfil
}

export const rutaInicioPorRol = (rol: RolAplicacion): string => {
  switch (rol) {
    case 'docente':
      return '/admin'
    case 'afiliado':
      return '/afiliados'
    default:
      return '/dashboard'
  }
}

/** Docente que todavía no configuró su segundo factor. El estado se deriva del
 *  access token verificado; páginas y APIs deben bloquear el acceso (doc 08 §6). */
export const mfaPendiente = async (): Promise<boolean> => {
  const perfil = await perfilSesion()
  return perfil?.rol === 'docente' && perfil.mfaPendiente === true
}

/** Acceso docente completo, incluido el segundo factor obligatorio. */
export const docenteHabilitado = async (): Promise<boolean> => {
  const perfil = await perfilSesion()
  return perfil?.rol === 'docente' && perfil.mfaPendiente !== true
}

/** Lee los claims sin verificar la firma: es SOLO para poblar la UI. La
 *  autorización real la hace cada servicio validando el JWT (doc 08 §5). */
export const claimsDeToken = (token: string): Record<string, unknown> | null => {
  const partes = token.split('.')
  if (partes.length !== 3 || !partes[1]) return null
  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
  } catch {
    return null
  }
}
