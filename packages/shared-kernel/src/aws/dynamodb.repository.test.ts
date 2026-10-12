import { describe, expect, it } from 'bun:test'
import { DynamoRepository, assertDynamoItemSize } from './dynamodb.repository'
import { DomainEvent } from '../domain-event.base'

class TestEvent extends DomainEvent {
  readonly eventType = 'identity.usuario-registrado.v1'
  readonly aggregateId = 'user-1'
  payload(): Record<string, unknown> {
    return { usuarioId: this.aggregateId }
  }
}

describe('DynamoRepository', () => {
  it('rechaza elementos por encima del límite de 400 KB', () => {
    expect(() =>
      assertDynamoItemSize({ PK: 'USER#1', SK: 'PROFILE', body: 'x'.repeat(410_000) }),
    ).toThrow('excede 400 KB')
  })

  it('requiere tabla y no permite reservar cuota superior al máximo', async () => {
    expect(() => new DynamoRepository({} as never, '  ')).toThrow('nombre de la tabla')
    const repository = new DynamoRepository({} as never, 'edtech-test-control')
    await expect(
      repository.reserveQuota({ key: { PK: 'QUOTA#2026-10', SK: 'chat' }, amount: 2, limit: 1 }),
    ).rejects.toThrow('unidades enteras positivas')
  })

  it('incluye los eventos en la misma transacción que el cambio de dominio', async () => {
    let captured: unknown
    const fakeClient = {
      send: async (command: { input: unknown }) => {
        captured = command.input
        return {}
      },
    }
    const repository = new DynamoRepository(fakeClient as never, 'identity')
    await repository.transactWithOutbox(
      [{ Put: { TableName: 'identity', Item: { PK: 'USER#1', SK: 'PROFILE' } } }],
      [new TestEvent()],
    )
    const input = captured as {
      TransactItems?: Array<{ Put?: { Item?: Record<string, unknown> } }>
    }
    expect(input.TransactItems).toHaveLength(2)
    expect(input.TransactItems?.[1]?.Put?.Item?.entity).toBe('Outbox')
  })
})
