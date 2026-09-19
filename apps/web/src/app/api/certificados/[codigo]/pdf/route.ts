import { gamificationApi } from '@/api/resto'
import { config } from '@/lib/config'

const respuestaError = (mensaje: string, status: number): Response =>
  Response.json({ error: mensaje }, { status })

/**
 * El PDF se sirve a través de la web para que el navegador nunca tenga que
 * resolver el hostname interno `localstack` del entorno local.
 */
export const GET = async (
  _peticion: Request,
  contexto: { params: Promise<{ codigo: string }> },
): Promise<Response> => {
  const { codigo } = await contexto.params
  const certificado = await gamificationApi.verificar(codigo).catch(() => null)
  if (!certificado?.pdfUrl) return respuestaError('El PDF todavía no está disponible', 404)

  let origen: URL
  try {
    origen = new URL(certificado.pdfUrl)
  } catch {
    return respuestaError('La dirección del PDF no es válida', 502)
  }

  let respuesta: Response
  try {
    respuesta = await fetch(origen)
  } catch {
    // El servicio entrega `localstack:4566` porque ese hostname existe dentro
    // de Podman. Si la web corre en Windows, usamos el mismo host del gateway
    // local y conservamos `Host` para que la firma S3 siga siendo válida.
    if (origen.hostname !== 'localstack') return respuestaError('No se pudo abrir el PDF', 502)

    const gateway = new URL(config.servicesApiBase)
    const accesoLocal = new URL(
      origen.pathname + origen.search,
      `${gateway.protocol}//${gateway.hostname}:4567`,
    )
    try {
      respuesta = await fetch(accesoLocal, { headers: { Host: 'localstack:4566' } })
    } catch {
      return respuestaError('No se pudo abrir el PDF', 502)
    }
  }

  if (!respuesta.ok || !respuesta.body) return respuestaError('No se pudo abrir el PDF', 502)

  return new Response(respuesta.body, {
    status: 200,
    headers: {
      'Content-Type': respuesta.headers.get('Content-Type') ?? 'application/pdf',
      'Content-Disposition': `inline; filename="certificado-${codigo.toUpperCase()}.pdf"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
