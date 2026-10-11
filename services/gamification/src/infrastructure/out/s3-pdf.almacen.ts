import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import type { AlmacenPdf, ColaCertificados } from '../../domain/ports-out/pdf.port'

export const crearS3Client = (cfg: { region: string; endpoint?: string }): S3Client =>
  new S3Client({
    region: cfg.region,
    ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: true } : {}),
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
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
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
    await this.sqs.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify({
          eventId: crypto.randomUUID(),
          eventType: 'gamification.generar-pdf.interno',
          occurredAt: new Date().toISOString(),
          aggregateId: certificadoId,
          correlationId: crypto.randomUUID(),
          payload: { certificadoId },
        }),
      }),
    )
  }
}
