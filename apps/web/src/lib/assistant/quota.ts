import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { config } from '@/lib/config'
import { AssistantProviderError } from './bedrock'

const tableName = config.assistant.controlTable
const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.cognito.region }), {
  marshallOptions: { removeUndefinedValues: true },
})

/** Cuenta global para el demo. ADD y ConditionExpression hacen la reserva atómica. */
export const reserveAssistantChatQuota = async (): Promise<void> => {
  if (!tableName) {
    if (config.assistant.production) throw new AssistantProviderError('not-configured')
    return
  }
  const month = new Date().toISOString().slice(0, 7)
  try {
    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK: `QUOTA#${month}`, SK: 'chat' },
        UpdateExpression: 'SET #updatedAt = :now ADD #used :one',
        ConditionExpression: 'attribute_not_exists(#used) OR #used < :limit',
        ExpressionAttributeNames: { '#used': 'used', '#updatedAt': 'updatedAt' },
        ExpressionAttributeValues: { ':one': 1, ':limit': 300, ':now': new Date().toISOString() },
      }),
    )
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      throw new AssistantProviderError('quota-exceeded')
    }
    throw new AssistantProviderError('unavailable')
  }
}

export const reserveAssistantTranscriptionQuota = async (
  userId: string,
  jobId: string,
  seconds: number,
): Promise<void> => {
  if (!tableName) {
    if (config.assistant.production) throw new AssistantProviderError('not-configured')
    return
  }
  const month = new Date().toISOString().slice(0, 7)
  try {
    await client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: tableName,
              Key: { PK: `QUOTA#${month}`, SK: 'transcription-seconds' },
              UpdateExpression: 'SET #updatedAt = :now ADD #used :seconds',
              ConditionExpression:
                'attribute_not_exists(#used) OR #used <= :maximumBeforeReservation',
              ExpressionAttributeNames: { '#used': 'used', '#updatedAt': 'updatedAt' },
              ExpressionAttributeValues: {
                ':seconds': seconds,
                ':maximumBeforeReservation': 1200 - seconds,
                ':now': new Date().toISOString(),
              },
            },
          },
          {
            Update: {
              TableName: tableName,
              Key: { PK: `TRANSCRIBE#${userId}`, SK: `JOB#${jobId}` },
              UpdateExpression:
                'SET #status = :starting, #transcribeJobName = :jobName, #reservedSeconds = :seconds, #quotaMonth = :month, #updatedAt = :now',
              ConditionExpression: '#status = :uploadPending',
              ExpressionAttributeNames: {
                '#status': 'status',
                '#transcribeJobName': 'transcribeJobName',
                '#reservedSeconds': 'reservedSeconds',
                '#quotaMonth': 'quotaMonth',
                '#updatedAt': 'updatedAt',
              },
              ExpressionAttributeValues: {
                ':starting': 'STARTING',
                ':uploadPending': 'UPLOAD_PENDING',
                ':jobName': `edtech-${jobId}`,
                ':seconds': seconds,
                ':month': month,
                ':now': new Date().toISOString(),
              },
            },
          },
        ],
      }),
    )
  } catch (error) {
    const cancellationReasons = (error as { CancellationReasons?: Array<{ Code?: string }> })
      .CancellationReasons
    if (
      (error as { name?: string }).name === 'TransactionCanceledException' &&
      cancellationReasons?.some(reason => reason.Code === 'ConditionalCheckFailed')
    ) {
      throw new AssistantProviderError('quota-exceeded')
    }
    throw new AssistantProviderError('unavailable')
  }
}
