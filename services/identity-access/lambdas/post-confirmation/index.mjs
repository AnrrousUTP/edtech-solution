// Lambda post-confirmation de Cognito (doc 08 §4, A-12): encola el alta del
// usuario en sqs-identity. NUNCA falla el registro: si SQS no responde, se
// registra el error y se devuelve el evento igual.
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { randomUUID } from 'node:crypto'

const sqs = new SQSClient({})

export const handler = async (event) => {
  try {
    const attrs = event.request?.userAttributes ?? {}
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: process.env.QUEUE_URL,
        MessageBody: JSON.stringify({
          eventId: randomUUID(),
          eventType: 'identity.alta-usuario-cognito.v1',
          occurredAt: new Date().toISOString(),
          aggregateId: attrs.sub ?? event.userName,
          correlationId: `cognito-${event.userName}`,
          payload: {
            sub: attrs.sub,
            email: attrs.email,
            nombreVisible: attrs['custom:nombre_visible'] ?? attrs.name ?? '',
          },
        }),
      }),
    )
  } catch (err) {
    console.error('post-confirmation: no se pudo encolar el alta', err)
  }
  return event
}
