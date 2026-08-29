import { cookies } from 'next/headers'

// Los tokens viven en cookies httpOnly + Secure + SameSite=Lax, escritas por el
// Route Handler del callback (doc 08 §7). NO en localStorage: cualquier XSS se
// llevaría el token. Los Server Components leen la cookie y llaman a las APIs
// con Authorization: Bearer — el navegador nunca ve el access token.
export const COOKIE_ACCESO = 'edtech_access'
export const COOKIE_REFRESH = 'edtech_refresh'
export const COOKIE_PERFIL = 'edtech_perfil' // legible por el cliente: solo datos de UI

export type PerfilSesion = {
  usuarioId: string
  email: string
  nombre: string
  roles: string[]
}

export const accessToken = async (): Promise<string | null> => {
  const almacen = await cookies()
  return almacen.get(COOKIE_ACCESO)?.value ?? null
}

export const perfilSesion = async (): Promise<PerfilSesion | null> => {
  const almacen = await cookies()
  const bruto = almacen.get(COOKIE_PERFIL)?.value
  if (!bruto) return null
  try {
    return JSON.parse(decodeURIComponent(bruto)) as PerfilSesion
  } catch {
    return null
  }
}

export const esAdmin = async (): Promise<boolean> => {
  const perfil = await perfilSesion()
  return perfil?.roles.includes('admin') ?? false
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
