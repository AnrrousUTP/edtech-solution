import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import Busboy from 'busboy'
import { NextResponse } from 'next/server'
import { AssistantProviderError, extraerResumenPdf } from '@/lib/assistant/bedrock'
import { reserveAssistantChatQuota } from '@/lib/assistant/quota'
import { config } from '@/lib/config'
import { logError } from '@/lib/logger'
import { createMediaS3Client } from '@/lib/media-storage'
import {
  MAX_MEDIA_UPLOAD_BYTES,
  MAX_MEDIA_UPLOAD_ERROR,
  mediaUploadSizeIsAllowed,
} from '@/lib/media-upload'
import { esDocente, mfaPendiente } from '@/lib/sesion'

export const runtime = 'nodejs'

const s3 = createMediaS3Client()
const TIPOS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
  ['application/pdf', 'pdf'],
])

type ArchivoSubido = { nombre: string; tipo: string; tamano: number; bytes: Buffer }

const analizarFormulario = async (
  request: Request,
): Promise<{ archivo: ArchivoSubido | null; superaLimite: boolean; multiples: boolean }> => {
  const contentType = request.headers.get('content-type') ?? ''
  if (!request.body || !contentType.toLowerCase().startsWith('multipart/form-data'))
    return { archivo: null, superaLimite: false, multiples: false }
  const contentLength = request.headers.get('content-length')
  const multipartLimit = MAX_MEDIA_UPLOAD_BYTES + 64 * 1024
  if (contentLength && Number(contentLength) > multipartLimit)
    return { archivo: null, superaLimite: true, multiples: false }

  return await new Promise((resolve, reject) => {
    let archivo: ArchivoSubido | null = null
    let superaLimite = false
    let multiples = false
    let cantidadArchivos = 0
    let bytesMultipartLeidos = 0
    const lecturasArchivo: Promise<void>[] = []
    const parser = Busboy({
      headers: { 'content-type': contentType },
      limits: { fileSize: MAX_MEDIA_UPLOAD_BYTES + 32 * 1024, files: 2 },
    })

    parser.on('file', (campo, stream, info) => {
      cantidadArchivos += 1
      if (campo !== 'file' || cantidadArchivos > 1) {
        multiples = cantidadArchivos > 1
        stream.resume()
        return
      }
      const partes: Buffer[] = []
      let tamano = 0
      let finalizarLectura: () => void = () => undefined
      lecturasArchivo.push(
        new Promise(resolve => {
          finalizarLectura = resolve
        }),
      )
      stream.on('data', (parte: Buffer) => {
        partes.push(parte)
        tamano += parte.length
      })
      stream.on('limit', () => {
        superaLimite = true
      })
      stream.on('end', () => {
        archivo = {
          nombre: info.filename ?? 'archivo',
          tipo: info.mimeType,
          tamano,
          bytes: Buffer.concat(partes, tamano),
        }
        finalizarLectura()
      })
      stream.on('error', reject)
    })
    parser.on('filesLimit', () => {
      multiples = true
    })
    parser.on('error', reject)
    parser.on('finish', () => {
      void Promise.all(lecturasArchivo).then(() => {
        if (!archivo)
          logError({
            event: 'admin-media-multipart-empty',
            contentLength,
            bytesMultipartLeidos,
            fileEvents: cantidadArchivos,
          })
        resolve({ archivo, superaLimite, multiples })
      }, reject)
    })

    const body = Readable.fromWeb(request.body as unknown as NodeReadableStream<Uint8Array>)
    body.on('data', (parte: Buffer) => {
      bytesMultipartLeidos += parte.length
    })
    body.on('error', reject)
    body.pipe(parser)
  })
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!(await esDocente()) || (await mfaPendiente()))
    return NextResponse.json({ error: 'Requiere rol docente y MFA configurado' }, { status: 403 })

  const bucket = config.assistant.mediaBucket
  if (!bucket) return NextResponse.json({ error: 'Almacenamiento no configurado' }, { status: 503 })

  let parsed: Awaited<ReturnType<typeof analizarFormulario>>
  try {
    parsed = await analizarFormulario(request)
  } catch (error) {
    const details = error as { name?: string; code?: string; message?: string }
    logError({
      event: 'admin-media-multipart-failed',
      errorName: details?.name ?? 'UnknownError',
      errorCode: details?.code,
      errorMessage: details?.message?.slice(0, 160),
      contentType: request.headers.get('content-type'),
      contentLength: request.headers.get('content-length'),
    })
    return NextResponse.json(
      { error: 'No se pudo leer el archivo enviado. Inténtalo de nuevo.' },
      { status: 400 },
    )
  }
  const file = parsed.archivo
  if (parsed.superaLimite || (file && !mediaUploadSizeIsAllowed(file.tamano)))
    return NextResponse.json({ error: MAX_MEDIA_UPLOAD_ERROR }, { status: 413 })
  if (parsed.multiples)
    return NextResponse.json({ error: 'Sube un archivo por solicitud' }, { status: 400 })
  if (!file) {
    logError({
      event: 'admin-media-file-missing',
      contentType: request.headers.get('content-type'),
      multipleFiles: parsed.multiples,
    })
    return NextResponse.json({ error: 'Selecciona una imagen o un PDF' }, { status: 400 })
  }
  const extension = TIPOS.get(file.tipo)
  if (!extension) return NextResponse.json({ error: 'Formato no admitido' }, { status: 415 })

  const bytes = new Uint8Array(file.bytes)
  const key = `course-media/${randomUUID()}.${extension}`
  let stage: 'store-file' | 'summarize-pdf' = 'store-file'
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: file.tipo,
        CacheControl: 'public, max-age=31536000, immutable',
        ServerSideEncryption: 'AES256',
      }),
    )

    let textoExtraido: string | undefined
    let advertencia: string | undefined
    if (file.tipo === 'application/pdf') {
      stage = 'summarize-pdf'
      try {
        await reserveAssistantChatQuota()
        textoExtraido = await extraerResumenPdf(bytes)
      } catch (error) {
        const code = error instanceof AssistantProviderError ? error.code : 'unavailable'
        logError({
          event: 'admin-pdf-summary-failed',
          errorCode: code,
          fileType: file.tipo,
          fileSize: file.tamano,
        })
        advertencia =
          code === 'quota-exceeded'
            ? 'El PDF quedó guardado, pero no se pudo extraer el texto porque se alcanzó el límite mensual de IA.'
            : 'El PDF quedó guardado, pero no se pudo extraer el texto con IA. Revisa el acceso a Amazon Bedrock e inténtalo de nuevo más tarde.'
      }
    }
    return NextResponse.json({
      url: `/api/media/${key}`,
      nombre: file.nombre,
      tipo: file.tipo === 'application/pdf' ? 'PDF' : 'IMAGEN',
      ...(textoExtraido ? { textoExtraido } : {}),
      ...(advertencia ? { advertencia } : {}),
    })
  } catch (error) {
    const details = error as {
      name?: string
      $metadata?: { httpStatusCode?: number; requestId?: string }
    }
    logError({
      event: 'admin-media-upload-failed',
      stage,
      errorName: details?.name ?? 'UnknownError',
      httpStatusCode: details?.$metadata?.httpStatusCode,
      requestId: details?.$metadata?.requestId,
      fileType: file.tipo,
      fileSize: file.tamano,
    })
    return NextResponse.json(
      {
        error:
          'No se pudo almacenar el archivo en S3. Revisa el servicio de almacenamiento e inténtalo de nuevo.',
      },
      { status: 502 },
    )
  }
}
