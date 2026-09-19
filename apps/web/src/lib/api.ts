import { z } from 'zod'
import { config } from './config'
import { accessToken } from './sesion'

// Cliente tipado por servicio: la respuesta se valida con Zod. Si un servicio
// cambia su contrato sin avisar, falla acá con un mensaje claro en vez de
// romper con `undefined` tres componentes más abajo (doc 11 §5).
export class ErrorApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje)
  }
}

const sobreExito = <T extends z.ZodTypeAny>(datos: T) => z.object({ data: datos })
const sobreError = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
})
const parsearJson = (texto: string): unknown => {
  if (!texto) return {}
  try {
    return JSON.parse(texto) as unknown
  } catch {
    return {}
  }
}

type Opciones = {
  metodo?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  cuerpo?: unknown
  autenticado?: boolean
  /** Server Components: sin caché por defecto, los datos son por usuario. */
  revalidar?: number | false
}

export const llamar = async <T extends z.ZodTypeAny>(
  ruta: string,
  esquema: T,
  opciones: Opciones = {},
): Promise<z.infer<T>> => {
  const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' }

  if (opciones.autenticado !== false) {
    const token = await accessToken()
    if (token) cabeceras.Authorization = `Bearer ${token}`
  }

  // En local el catálogo puede exponerse directamente desde Anrrous Dev,
  // mientras que en AWS continúa pasando por el gateway definido en API_BASE.
  const base = ruta.startsWith('/api/catalog') ? config.catalogApiBase : config.servicesApiBase
  const respuesta = await fetch(`${base}${ruta}`, {
    method: opciones.metodo ?? 'GET',
    headers: cabeceras,
    ...(opciones.cuerpo !== undefined ? { body: JSON.stringify(opciones.cuerpo) } : {}),
    ...(opciones.revalidar === false || opciones.revalidar === undefined
      ? { cache: 'no-store' as const }
      : { next: { revalidate: opciones.revalidar } }),
  })

  const texto = await respuesta.text()
  if (!respuesta.ok) {
    const parseado = sobreError.safeParse(parsearJson(texto))
    throw new ErrorApi(
      respuesta.status,
      parseado.success ? parseado.data.error.code : 'DESCONOCIDO',
      parseado.success ? parseado.data.error.message : `La API devolvió ${respuesta.status}`,
    )
  }

  const cuerpo = sobreExito(esquema).safeParse(parsearJson(texto))
  if (!cuerpo.success) {
    throw new ErrorApi(
      respuesta.status,
      'CONTRATO_ROTO',
      `La respuesta de ${ruta} no cumple el contrato esperado: ${cuerpo.error.issues
        .map(i => `${i.path.join('.')} ${i.message}`)
        .join('; ')}`,
    )
  }
  return cuerpo.data.data
}

/** Devuelve null en 401/403/404 en vez de lanzar: para lo opcional de la UI. */
export const llamarOpcional = async <T extends z.ZodTypeAny>(
  ruta: string,
  esquema: T,
  opciones: Opciones = {},
): Promise<z.infer<T> | null> => {
  try {
    return await llamar(ruta, esquema, opciones)
  } catch (err) {
    if (err instanceof ErrorApi && [401, 403, 404].includes(err.status)) return null
    throw err
  }
}
