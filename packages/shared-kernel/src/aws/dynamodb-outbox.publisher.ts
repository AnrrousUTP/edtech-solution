import { DynamoDBClient, UpdateItemCommand, type AttributeValue } from '@aws-sdk/client-dynamodb'
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'

type StreamRecord = {
  eventID?: string
  eventName?: string
  dynamodb?: {
    SequenceNumber?: string
    Keys?: Record<string, AttributeValue>
    NewImage?: Record<string, AttributeValue>
  }
  eventSourceARN?: string
}

type StreamBatch = { Records?: StreamRecord[] }
type PartialBatchResponse = { batchItemFailures: Array<{ itemIdentifier: string }> }
type ReconcileRequest = { task: 'reconcile-outbox' }

export type OutboxEvent = {
  eventId: string
  eventType: string
  aggregateId: string
  occurredAt: string
  payload: Record<string, unknown>
  correlationId?: string
}

export const eventBridgeEntry = (event: OutboxEvent, busName: string) => ({
  EventBusName: busName,
  Source: `edtech.${event.eventType.split('.')[0]}`,
  DetailType: event.eventType,
  Detail: JSON.stringify(event),
})

const tableNameFromArn = (arn: string | undefined): string | null => {
  const match = arn?.match(/:table\/([^/]+)\/stream\//)
  return match?.[1] ?? null
}

export const crearOutboxStreamHandler = (options: {
  busName: string
  domainTables?: Record<string, string>
  dynamodb?: DynamoDBClient
  eventBridge?: EventBridgeClient
  now?: () => Date
}) => {
  const dynamodb = options.dynamodb ?? new DynamoDBClient({})
  const eventBridge = options.eventBridge ?? new EventBridgeClient({})
  const documentClient = DynamoDBDocumentClient.from(dynamodb)
  const now = options.now ?? (() => new Date())

  const publicar = async (tableName: string, item: Record<string, unknown>): Promise<void> => {
    if (item.entity !== 'Outbox' || item.publishedAt) return
    const event: OutboxEvent = {
      eventId: String(item.eventId ?? ''),
      eventType: String(item.eventType ?? ''),
      aggregateId: String(item.aggregateId ?? ''),
      occurredAt: String(item.occurredAt ?? ''),
      payload: (item.payload as Record<string, unknown> | undefined) ?? {},
      ...(typeof item.correlationId === 'string' ? { correlationId: item.correlationId } : {}),
    }
    if (!event.eventId || !event.eventType || !event.aggregateId || !event.occurredAt) {
      throw new Error('Registro outbox incompleto')
    }
    const response = await eventBridge.send(
      new PutEventsCommand({ Entries: [eventBridgeEntry(event, options.busName)] }),
    )
    if ((response.FailedEntryCount ?? 0) > 0)
      throw new Error('EventBridge rechazó el evento outbox')
    const publishedAt = now().toISOString()
    try {
      await dynamodb.send(
        new UpdateItemCommand({
          TableName: tableName,
          Key: { PK: { S: String(item.PK) }, SK: { S: String(item.SK) } },
          UpdateExpression:
            'SET publishedAt = :publishedAt, GSI1PK = :published, GSI1SK = :publishedKey',
          ConditionExpression: 'attribute_not_exists(publishedAt)',
          ExpressionAttributeValues: {
            ':publishedAt': { S: publishedAt },
            ':published': { S: 'OUTBOX#PUBLISHED' },
            ':publishedKey': { S: `${publishedAt}#${event.eventId}` },
          },
        }),
      )
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
    }
  }

  const reconciliar = async (): Promise<{ reconciled: number }> => {
    let reconciled = 0
    for (const tableName of Object.values(options.domainTables ?? {})) {
      let cursor: Record<string, unknown> | undefined
      do {
        const page = await documentClient.send(
          new QueryCommand({
            TableName: tableName,
            IndexName: 'GSI1',
            KeyConditionExpression: 'GSI1PK = :pending',
            ExpressionAttributeValues: { ':pending': 'OUTBOX#PENDING' },
            Limit: 50,
            ...(cursor ? { ExclusiveStartKey: cursor } : {}),
          }),
        )
        for (const item of page.Items ?? []) {
          await publicar(tableName, item)
          reconciled += 1
        }
        cursor = page.LastEvaluatedKey
      } while (cursor)
    }
    return { reconciled }
  }

  return async (batch: StreamBatch | ReconcileRequest): Promise<PartialBatchResponse> => {
    if ('task' in batch) {
      if (batch.task === 'reconcile-outbox') {
        await reconciliar()
        return { batchItemFailures: [] }
      }
      throw new Error('Tarea outbox desconocida')
    }
    const failures: PartialBatchResponse['batchItemFailures'] = []
    for (const record of batch.Records ?? []) {
      const sequence = record.dynamodb?.SequenceNumber
      try {
        if (record.eventName !== 'INSERT' && record.eventName !== 'MODIFY') continue
        const image = record.dynamodb?.NewImage
        if (!image) continue
        const item = unmarshall(image)
        const tableName = tableNameFromArn(record.eventSourceARN)
        if (!tableName) throw new Error('No se pudo leer el nombre de la tabla del stream')
        await publicar(tableName, item)
      } catch (error) {
        if ((error as { name?: string }).name === 'ConditionalCheckFailedException') continue
        if (sequence) failures.push({ itemIdentifier: sequence })
      }
    }
    return { batchItemFailures: failures }
  }
}

const domainTables = process.env.DOMAIN_TABLES
  ? (JSON.parse(process.env.DOMAIN_TABLES) as Record<string, string>)
  : {}
export const handler = crearOutboxStreamHandler({
  busName: process.env.EVENT_BUS_NAME ?? '',
  domainTables,
})
