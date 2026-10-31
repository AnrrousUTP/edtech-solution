import { randomUUID } from 'node:crypto'
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'

export type EventClaim =
  { status: 'CLAIMED'; token: string } | { status: 'IN_PROGRESS' | 'PROCESSED' }

/** Inbox idempotente con lease para eventos de actividad y trabajos PDF. */
export class DynamoEventInbox {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly now: () => Date = () => new Date(),
    private readonly leaseSeconds = 60,
  ) {
    if (!tableName.trim()) throw new Error('Falta el nombre de la tabla DynamoDB')
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 1)
      throw new Error('leaseSeconds debe ser un entero positivo')
  }

  async claimEvent(eventId: string, eventType: string): Promise<EventClaim> {
    const now = this.now()
    const nowSeconds = Math.floor(now.getTime() / 1000)
    const token = randomUUID()
    const leaseUntil = nowSeconds + this.leaseSeconds
    const expiresAt = nowSeconds + 30 * 24 * 60 * 60
    const key = { PK: `EVENT#${eventId}`, SK: 'PROCESSED' }

    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            ...key,
            entity: 'ProcessedEvent',
            eventId,
            eventType,
            status: 'PROCESSING',
            leaseToken: token,
            leaseUntil,
            expiresAt,
            startedAt: now.toISOString(),
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      )
      return { status: 'CLAIMED', token }
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
    }

    const existing = await this.read(key)
    if (!existing) return { status: 'IN_PROGRESS' }
    if (existing.status === 'PROCESSED' || existing.processedAt) return { status: 'PROCESSED' }
    if (existing.status !== 'PROCESSING') return { status: 'IN_PROGRESS' }
    if (typeof existing.leaseUntil === 'number' && existing.leaseUntil > nowSeconds)
      return { status: 'IN_PROGRESS' }

    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: key,
          UpdateExpression:
            'SET leaseToken = :token, leaseUntil = :leaseUntil, updatedAt = :now, expiresAt = :expiresAt',
          ConditionExpression:
            '#status = :processing AND (attribute_not_exists(leaseUntil) OR leaseUntil <= :nowSeconds)',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':token': token,
            ':leaseUntil': leaseUntil,
            ':now': now.toISOString(),
            ':nowSeconds': nowSeconds,
            ':expiresAt': expiresAt,
            ':processing': 'PROCESSING',
          },
        }),
      )
      return { status: 'CLAIMED', token }
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
    }

    const concurrent = await this.read(key)
    return concurrent?.status === 'PROCESSED' || concurrent?.processedAt
      ? { status: 'PROCESSED' }
      : { status: 'IN_PROGRESS' }
  }

  async markProcessed(eventId: string, token: string): Promise<void> {
    const now = this.now()
    const nowSeconds = Math.floor(now.getTime() / 1000)
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: `EVENT#${eventId}`, SK: 'PROCESSED' },
        UpdateExpression:
          'SET #status = :processed, processedAt = :now, expiresAt = :expiresAt REMOVE leaseToken, leaseUntil',
        ConditionExpression: '#status = :processing AND leaseToken = :token',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':processed': 'PROCESSED',
          ':processing': 'PROCESSING',
          ':token': token,
          ':now': now.toISOString(),
          ':expiresAt': nowSeconds + 30 * 24 * 60 * 60,
        },
      }),
    )
  }

  async releaseEvent(eventId: string, token?: string): Promise<void> {
    if (!token) throw new Error('Falta el token de lease del evento')
    try {
      await this.client.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: `EVENT#${eventId}`, SK: 'PROCESSED' },
          ConditionExpression: '#status = :processing AND leaseToken = :token',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':processing': 'PROCESSING', ':token': token },
        }),
      )
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
    }
  }

  private async read(key: {
    PK: string
    SK: string
  }): Promise<Record<string, unknown> | undefined> {
    const result = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: key, ConsistentRead: true }),
    )
    return result.Item
  }
}
