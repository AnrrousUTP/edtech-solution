import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { NextResponse } from 'next/server'
import { config } from '@/lib/config'

export const runtime = 'nodejs'

const s3 = new S3Client({ region: config.cognito.region })

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const bucket = config.assistant.mediaBucket
  const { key: segments } = await params
  const key = segments.join('/')
  if (!bucket || !key.startsWith('course-media/'))
    return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    if (!object.Body) return new Response(null, { status: 404 })
    return new Response(object.Body.transformToWebStream(), {
      headers: {
        'Content-Type': object.ContentType ?? 'application/octet-stream',
        ...(object.ContentLength != null ? { 'Content-Length': String(object.ContentLength) } : {}),
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })
  }
}
