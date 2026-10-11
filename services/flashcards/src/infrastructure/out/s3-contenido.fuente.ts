import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import type { ContenidoFuente, ColaGeneracion } from '../../domain/ports-out/contenido-fuente.port'
export const crearS3Client = (cfg: { region: string; endpoint?: string }): S3Client =>
  new S3Client({
    region: cfg.region,
    ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: true } : {}),
  })
export class S3ContenidoFuente implements ContenidoFuente {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}
  async leer(key: string): Promise<string> {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    if (!r.Body) throw new Error('S3 devolvió contenido vacío')
    return r.Body.transformToString()
  }
}
export class SqsColaGeneracion implements ColaGeneracion {
  constructor(
    private readonly sqs: SQSClient,
    private readonly queueUrl: string,
  ) {}
  async encolar(mazoId: string): Promise<void> {
    await this.sqs.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify({
          eventId: crypto.randomUUID(),
          eventType: 'flashcards.generar-mazo.interno',
          occurredAt: new Date().toISOString(),
          aggregateId: mazoId,
          correlationId: crypto.randomUUID(),
          payload: { mazoId },
        }),
      }),
    )
  }
}
