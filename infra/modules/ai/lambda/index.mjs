// Action group del agente (doc 10 §3): le devuelve al modelo el texto de las
// lecciones a partir de sus claves de S3.
//
// Lee de la MISMA fuente que el worker (`s3://…/contenido/…`, doc 02 §7.3): no
// toca la base de catalog ni ninguna otra —I-4 se mantiene—, y como flashcards
// nunca escribe en catalog, el bucle evento→generación→evento es
// estructuralmente imposible (doc 10 §7.1).
//
// Hoy el worker ya manda el contenido dentro del prompt, así que esta
// herramienta es la que permite el paso siguiente: mandarle al agente solo las
// REFERENCIAS y que él pida el texto cuando lo necesite, que es lo que el doc 02
// §7.3 pide de verdad.
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

const s3 = new S3Client({})

const parsearS3Uri = uri => {
  if (!uri.startsWith('s3://')) throw new Error(`Clave de contenido no reconocida: ${uri}`)
  const resto = uri.slice('s3://'.length)
  const corte = resto.indexOf('/')
  return { Bucket: resto.slice(0, corte), Key: resto.slice(corte + 1) }
}

const respuesta = (evento, codigo, cuerpo) => ({
  messageVersion: '1.0',
  response: {
    actionGroup: evento.actionGroup,
    apiPath: evento.apiPath,
    httpMethod: evento.httpMethod,
    httpStatusCode: codigo,
    responseBody: { 'application/json': { body: JSON.stringify(cuerpo) } },
  },
})

export const handler = async evento => {
  const propiedades = evento.requestBody?.content?.['application/json']?.properties ?? []
  const bruto = propiedades.find(p => p.name === 'claves')?.value

  let claves
  try {
    claves = typeof bruto === 'string' ? JSON.parse(bruto) : bruto
  } catch {
    claves = null
  }

  if (!Array.isArray(claves) || claves.length === 0) {
    return respuesta(evento, 400, { error: 'Falta la lista de claves de contenido' })
  }

  // Un tomo tiene pocas lecciones; el tope evita que una llamada mal formada
  // convierta esto en una descarga masiva.
  if (claves.length > 20) {
    return respuesta(evento, 400, { error: 'Demasiadas claves para un solo tomo' })
  }

  const lecciones = []
  for (const clave of claves) {
    try {
      const r = await s3.send(new GetObjectCommand(parsearS3Uri(String(clave))))
      lecciones.push({ clave, contenido: await r.Body.transformToString() })
    } catch (err) {
      return respuesta(evento, 404, { error: `No se pudo leer ${clave}: ${err.message}` })
    }
  }

  return respuesta(evento, 200, { lecciones })
}
