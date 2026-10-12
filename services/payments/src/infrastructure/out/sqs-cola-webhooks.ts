import { randomUUID } from 'node:crypto'
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import type { ColaWebhooks } from '../../domain/ports-out/orden.repository'

/** Queue adapter for the HTTP webhook endpoint; the signed raw body remains in DynamoDB. */
export class SqsColaWebhooks implements ColaWebhooks {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
  ) {
    if (!queueUrl.trim()) throw new Error('Falta la URL de la cola de webhooks de pagos')
  }

  async encolar(paypalEventId: string): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify({
          eventId: randomUUID(),
          eventType: 'payments.webhook-recibido.interno',
          occurredAt: new Date().toISOString(),
          aggregateId: paypalEventId,
          correlationId: randomUUID(),
          payload: { paypalEventId },
        }),
      }),
    )
  }
}
