// Lambda post-confirmation de Cognito (doc 08 §4, A-12): encola el alta del
// usuario en sqs-identity. NUNCA falla el registro: si SQS no responde, se
// registra el error y se devuelve el evento igual.
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { randomUUID } from 'node:crypto'

const sqs = new SQSClient({})
const cognito = new CognitoIdentityProviderClient({})

const rolesPublicos = {
  estudiante: { group: 'estudiante', domain: 'ESTUDIANTE' },
  afiliado: { group: 'afiliado', domain: 'AFILIADO' },
}

export const handler = async (event) => {
  try {
    const attrs = event.request?.userAttributes ?? {}
    const rolSolicitado = attrs['custom:rol_aplicacion']
    // No confiar en el rol enviado al registro: docente solo se asigna por el
    // aprovisionamiento operativo, nunca desde Cognito SignUp ni el navegador.
    const rol = rolSolicitado === 'afiliado' ? rolesPublicos.afiliado : rolesPublicos.estudiante
    try {
      await cognito.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: event.userPoolId,
          Username: event.userName,
          GroupName: rol.group,
        }),
      )
    } catch (err) {
      console.error('post-confirmation: no se pudo asignar grupo', err)
    }
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
            rol: rol.domain,
          },
        }),
      }),
    )
  } catch (err) {
    console.error('post-confirmation: no se pudo encolar el alta', err)
  }
  return event
}
