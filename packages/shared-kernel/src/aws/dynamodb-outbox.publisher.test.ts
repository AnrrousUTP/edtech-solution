import { describe, expect, it } from 'bun:test'
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge'
import { crearOutboxStreamHandler, eventBridgeEntry } from './dynamodb-outbox.publisher'

describe('DynamoDB outbox publisher', () => {
  it('conserva el sobre de evento que consumen los otros dominios', () => {
    const entry = eventBridgeEntry(
      {
        eventId: 'evt-1',
        eventType: 'payments.pago-confirmado.v1',
        aggregateId: 'order-1',
        occurredAt: '2026-10-11T12:00:00.000Z',
        payload: { ordenId: 'order-1' },
      },
      'edtech-lowcost',
    )
    expect(entry.Source).toBe('edtech.payments')
    expect(entry.DetailType).toBe('payments.pago-confirmado.v1')
    expect(JSON.parse(entry.Detail)).toMatchObject({ eventId: 'evt-1', aggregateId: 'order-1' })
  })

  it('publica solo el outbox y lo marca después de confirmar EventBridge', async () => {
    const calls: string[] = []
    const dynamodb = new DynamoDBClient({ region: 'us-east-1' })
    dynamodb.send = (async command => {
      calls.push(command.constructor.name)
      return {} as never
    }) as typeof dynamodb.send
    const eventBridge = new EventBridgeClient({ region: 'us-east-1' })
    eventBridge.send = (async command => {
      calls.push(command.constructor.name)
      return { FailedEntryCount: 0 } as never
    }) as typeof eventBridge.send
    const handler = crearOutboxStreamHandler({
      busName: 'edtech-lowcost',
      dynamodb,
      eventBridge,
      now: () => new Date('2026-10-11T12:00:00.000Z'),
    })

    const result = await handler({
      Records: [
        {
          eventID: 'record-1',
          eventName: 'INSERT',
          eventSourceARN:
            'arn:aws:dynamodb:us-east-1:123456789012:table/edtech-lowcost-payments/stream/now',
          dynamodb: {
            SequenceNumber: '100',
            NewImage: {
              PK: { S: 'OUTBOX#evt-1' },
              SK: { S: 'EVENT' },
              entity: { S: 'Outbox' },
              eventId: { S: 'evt-1' },
              eventType: { S: 'payments.venta-referida-confirmada.v1' },
              aggregateId: { S: 'order-1' },
              occurredAt: { S: '2026-10-11T11:59:00.000Z' },
              payload: { M: { ordenId: { S: 'order-1' } } },
            },
          },
        },
      ],
    })

    expect(calls).toEqual(['PutEventsCommand', 'UpdateItemCommand'])
    expect(result.batchItemFailures).toEqual([])
  })

  it('devuelve el sequence number como fallo si EventBridge no acepta el evento', async () => {
    const dynamodb = new DynamoDBClient({ region: 'us-east-1' })
    const eventBridge = new EventBridgeClient({ region: 'us-east-1' })
    eventBridge.send = (async () => ({ FailedEntryCount: 1 }) as never) as typeof eventBridge.send
    const handler = crearOutboxStreamHandler({ busName: 'edtech-lowcost', dynamodb, eventBridge })
    const result = await handler({
      Records: [
        {
          eventID: 'record-2',
          eventName: 'INSERT',
          eventSourceARN:
            'arn:aws:dynamodb:us-east-1:123456789012:table/edtech-lowcost-payments/stream/now',
          dynamodb: {
            SequenceNumber: '200',
            NewImage: {
              PK: { S: 'OUTBOX#evt-2' },
              SK: { S: 'EVENT' },
              entity: { S: 'Outbox' },
              eventId: { S: 'evt-2' },
              eventType: { S: 'payments.pago-confirmado.v1' },
              aggregateId: { S: 'order-2' },
              occurredAt: { S: '2026-10-11T11:59:00.000Z' },
            },
          },
        },
      ],
    })
    expect(result.batchItemFailures).toEqual([{ itemIdentifier: '200' }])
  })
})
