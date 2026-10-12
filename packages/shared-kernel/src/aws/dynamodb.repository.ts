import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type QueryCommandInput,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb'
import { decodificarCursor, codificarCursor } from '../pagination.cursor'
import type { DomainEvent } from '../domain-event.base'

export type DynamoKey = { PK: string; SK: string }
export type DynamoItem = DynamoKey & Record<string, unknown>

export type DynamoPage<T> = {
  items: T[]
  nextCursor: string | null
}

export class DynamoConditionFailedError extends Error {
  readonly code = 'DYNAMO_CONDITION_FAILED'
  constructor(message = 'La operación fue modificada por otro proceso') {
    super(message)
    this.name = 'DynamoConditionFailedError'
  }
}

export class DynamoCursorError extends Error {
  readonly code = 'DYNAMO_CURSOR_INVALID'
  constructor() {
    super('El cursor de paginación no es válido')
    this.name = 'DynamoCursorError'
  }
}

export const crearDynamoDocumentClient = (options: { region?: string; endpoint?: string } = {}) =>
  DynamoDBDocumentClient.from(
    new DynamoDBClient({
      ...(options.region ? { region: options.region } : {}),
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      ...(options.endpoint
        ? { credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
        : {}),
    }),
    { marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true } },
  )

export const assertDynamoItemSize = (item: DynamoItem): void => {
  const bytes = Buffer.byteLength(JSON.stringify(item), 'utf8')
  if (bytes > 400 * 1024) {
    throw new RangeError(`El elemento DynamoDB excede 400 KB (${bytes} bytes)`)
  }
}

const cursorValue = (cursor: string | undefined): Record<string, unknown> | undefined => {
  if (!cursor) return undefined
  const decoded = decodificarCursor<Record<string, unknown>>(cursor)
  if (!decoded.ok || !decoded.value || typeof decoded.value !== 'object') {
    throw new DynamoCursorError()
  }
  return decoded.value
}

/** Adaptador compartido para operaciones DynamoDB de bajo nivel.
 * Los repositorios de dominio definen sus propias claves y validaciones.
 */
export class DynamoRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    readonly tableName: string,
  ) {
    if (!tableName.trim()) throw new Error('Falta el nombre de la tabla DynamoDB')
  }

  async get<T extends DynamoItem>(key: DynamoKey, consistentRead = false): Promise<T | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: key,
        ConsistentRead: consistentRead,
      }),
    )
    return (result.Item as T | undefined) ?? null
  }

  async createIfAbsent(item: DynamoItem): Promise<void> {
    assertDynamoItemSize(item)
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      }),
    )
  }

  async putVersioned(item: DynamoItem, expectedVersion: number | null): Promise<void> {
    assertDynamoItemSize(item)
    const condition =
      expectedVersion === null
        ? 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
        : 'version = :expectedVersion'
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { ...item, version: expectedVersion === null ? 1 : expectedVersion + 1 },
        ConditionExpression: condition,
        ...(expectedVersion === null
          ? {}
          : { ExpressionAttributeValues: { ':expectedVersion': expectedVersion } }),
      }),
    )
  }

  async query<T>(options: {
    keyConditionExpression: string
    expressionAttributeValues: Record<string, unknown>
    expressionAttributeNames?: Record<string, string>
    indexName?: 'GSI1' | 'GSI2'
    filterExpression?: string
    cursor?: string
    limit?: number
    scanIndexForward?: boolean
    consistentRead?: boolean
  }): Promise<DynamoPage<T>> {
    const input: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: options.keyConditionExpression,
      ExpressionAttributeValues: options.expressionAttributeValues,
      ...(options.expressionAttributeNames
        ? { ExpressionAttributeNames: options.expressionAttributeNames }
        : {}),
      ...(options.indexName ? { IndexName: options.indexName } : {}),
      ...(options.filterExpression ? { FilterExpression: options.filterExpression } : {}),
      ...(options.limit ? { Limit: Math.min(Math.max(options.limit, 1), 100) } : { Limit: 25 }),
      ...(options.scanIndexForward === undefined
        ? {}
        : { ScanIndexForward: options.scanIndexForward }),
      ...(options.consistentRead && !options.indexName ? { ConsistentRead: true } : {}),
      ...(options.cursor ? { ExclusiveStartKey: cursorValue(options.cursor) } : {}),
    }
    const result = await this.client.send(new QueryCommand(input))
    const key = result.LastEvaluatedKey
    return {
      items: (result.Items ?? []) as T[],
      nextCursor: key ? codificarCursor(key) : null,
    }
  }

  async transact(items: NonNullable<TransactWriteCommandInput['TransactItems']>): Promise<void> {
    if (!items.length || items.length > 100) {
      throw new RangeError('Una transacción DynamoDB debe contener entre 1 y 100 operaciones')
    }
    await this.client.send(
      new TransactWriteCommand({
        TransactItems: items,
      }),
    )
  }

  /** Persiste cambios de dominio y outbox en una única transacción DynamoDB. */
  async transactWithOutbox(
    operations: NonNullable<TransactWriteCommandInput['TransactItems']>,
    events: DomainEvent[],
  ): Promise<void> {
    const now = new Date().toISOString()
    const outbox = events.map(event => ({
      Put: {
        TableName: this.tableName,
        Item: {
          PK: `OUTBOX#${event.eventId}`,
          SK: 'EVENT',
          entity: 'Outbox',
          eventId: event.eventId,
          eventType: event.eventType,
          aggregateId: event.aggregateId,
          occurredAt: event.occurredAt.toISOString(),
          payload: event.payload(),
          createdAt: now,
          expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          GSI1PK: 'OUTBOX#PENDING',
          GSI1SK: `${event.occurredAt.toISOString()}#${event.eventId}`,
        },
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
    }))
    await this.transact([...operations, ...outbox])
  }

  /** Reserva cuota de forma atómica. Reintentos concurrentes no pueden exceder el límite. */
  async reserveQuota(input: {
    key: DynamoKey
    amount: number
    limit: number
    expiresAt?: number
  }): Promise<number> {
    if (
      !Number.isSafeInteger(input.amount) ||
      input.amount <= 0 ||
      !Number.isSafeInteger(input.limit) ||
      input.limit < input.amount
    ) {
      throw new RangeError('La cuota debe usar unidades enteras positivas')
    }
    const result = await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: input.key,
        UpdateExpression: 'SET #updatedAt = :now, #expiresAt = :expiresAt ADD #used :amount',
        ConditionExpression: 'attribute_not_exists(#used) OR #used <= :maximumBeforeReservation',
        ExpressionAttributeNames: {
          '#used': 'used',
          '#updatedAt': 'updatedAt',
          '#expiresAt': 'expiresAt',
        },
        ExpressionAttributeValues: {
          ':amount': input.amount,
          ':maximumBeforeReservation': input.limit - input.amount,
          ':now': new Date().toISOString(),
          ':expiresAt': input.expiresAt ?? Math.floor(Date.now() / 1000) + 40 * 24 * 60 * 60,
        },
        ReturnValues: 'ALL_NEW',
      }),
    )
    return Number(result.Attributes?.used ?? 0)
  }
}
