import { randomUUID } from 'node:crypto'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { NextResponse } from 'next/server'
import { extraerResumenPdf } from '@/lib/assistant/bedrock'
import { config } from '@/lib/config'
import { esDocente, mfaPendiente } from '@/lib/sesion'

export const runtime = 'nodejs'

const s3 = new S3Client({ region: config.cognito.region })
const MAX_BYTES = 4 * 1024 * 1024
const TIPOS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
  ['application/pdf', 'pdf'],
])

export async function POST(request: Request): Promise<NextResponse> {
  if (!(await esDocente()) || (await mfaPendiente()))
    return NextResponse.json({ error: 'Requiere rol docente y MFA configurado' }, { status: 403 })

  const bucket = config.assistant.mediaBucket
  if (!bucket) return NextResponse.json({ error: 'Almacenamiento no configurado' }, { status: 503 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File))
    return NextResponse.json({ error: 'Selecciona una imagen o un PDF' }, { status: 400 })
  const extension = TIPOS.get(file.type)
  if (!extension) return NextResponse.json({ error: 'Formato no admitido' }, { status: 415 })
  if (file.size < 1 || file.size > MAX_BYTES)
    return NextResponse.json({ error: 'El archivo debe pesar hasta 4 MB' }, { status: 413 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const key = `course-media/${randomUUID()}.${extension}`
  try {
    const textoExtraido =
      file.type === 'application/pdf' ? await extraerResumenPdf(bytes, file.name) : undefined
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: file.type,
        CacheControl: 'public, max-age=31536000, immutable',
        ServerSideEncryption: 'AES256',
      }),
    )
    return NextResponse.json({
      url: `/api/media/${key}`,
      nombre: file.name,
      tipo: file.type === 'application/pdf' ? 'PDF' : 'IMAGEN',
      ...(textoExtraido ? { textoExtraido } : {}),
    })
  } catch {
    return NextResponse.json(
      { error: 'No se pudo subir el archivo. Revisa el formato e inténtalo de nuevo.' },
      { status: 502 },
    )
  }
}
