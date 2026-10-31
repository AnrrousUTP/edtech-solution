import { createHash } from 'node:crypto'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import type { AlmacenPdf, ColaCertificados } from '../../domain/ports-out/pdf.port'

export const crearS3Client = (cfg: { region: string; endpoint?: string }): S3Client =>
  new S3Client({
    region: cfg.region,
    ...(cfg.endpoint
      ? {
          endpoint: cfg.endpoint,
          forcePathStyle: true,
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        }
      : {}),
  })
export class S3AlmacenPdf implements AlmacenPdf {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}
  async guardar(certificadoId: string, pdf: Uint8Array): Promise<string> {
    const key = `certificados/${certificadoId}.pdf`
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: pdf,
        ContentType: 'application/pdf',
      }),
    )
    return key
  }
  async urlFirmada(key: string, segundos: number): Promise<string> {
    // Bun puede instalar dos copias compatibles de @smithy/core en workspaces;
    // el cliente y el presigner comparten API en runtime, pero sus tipos nominales
    // llevan un miembro privado distinto. La conversión queda aislada en este borde.
    const firmar = getSignedUrl as unknown as (
      client: unknown,
      command: unknown,
      options: { expiresIn: number },
    ) => Promise<string>
    return firmar(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: segundos,
    })
  }
}
export class SqsColaCertificados implements ColaCertificados {
  constructor(
    private readonly sqs: SQSClient,
    private readonly queueUrl: string,
  ) {}
  async encolar(certificadoId: string): Promise<void> {
    const hex = createHash('sha256')
      .update(`gamification.generar-pdf.interno:${certificadoId}`)
      .digest('hex')
      .slice(0, 32)
      .split('')
    hex[12] = '5'
    hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16] ?? '0', 16) & 3] ?? '8'
    const eventId = `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20, 32).join('')}`
    await this.sqs.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify({
          eventId,
          eventType: 'gamification.generar-pdf.interno',
          occurredAt: new Date().toISOString(),
          aggregateId: certificadoId,
          correlationId: eventId,
          payload: { certificadoId },
        }),
      }),
    )
  }
}
