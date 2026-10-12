import { describe, expect, it } from 'bun:test'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { DynamoAfiliadosRepository } from './repositorio.dynamodb'
import type { SobreEvento } from '@edtech/shared-kernel'

type Request = { input: Record<string, unknown>; name: string }
const clientFake = (send: (request: Request) => Promise<unknown>) =>
  ({
    send: (command: { input: Record<string, unknown>; constructor: { name: string } }) =>
      send({ input: command.input, name: command.constructor.name }),
  }) as unknown as DynamoDBDocumentClient

describe('DynamoAfiliadosRepository', () => {
  it('activa un afiliado y reserva usuario, referencia y outbox en la misma transacción', async () => {
    const requests: Request[] = []
    const repo = new DynamoAfiliadosRepository(
      clientFake(async request => {
        requests.push(request)
        return {}
      }),
      'affiliates',
    )

    const affiliate = await repo.activar('user-123')

    expect(affiliate.activo).toBe(true)
    expect(affiliate.usuarioId).toBe('user-123')
    expect(affiliate.refId).toMatch(/^[0-9a-f-]{36}$/)
    expect(requests).toHaveLength(2)
    expect(requests[1]?.name).toBe('TransactWriteCommand')
    const operations = requests[1]?.input.TransactItems as Array<{
      Put?: { Item: Record<string, unknown> }
    }>
    expect(operations).toHaveLength(4)
    expect(operations.map(operation => operation.Put?.Item.entity)).toEqual([
      'Affiliate',
      'AffiliateLookup',
      'ReferralLookup',
      'Outbox',
    ])
  })

  it('guarda comisión, lookup único por orden, movimiento, aviso y evento juntos', async () => {
    const requests: Request[] = []
    const sale = {
      afiliadoId: 'affiliate-1',
      afiliadoUsuarioId: 'seller-1',
      visitaId: 'visit-1',
      refId: 'ref-1',
      compradorId: 'buyer-1',
      politica: 'ultimo-referido-30d-v1',
      tasaBps: 500,
      ordenId: 'order-1',
      cursoId: 'course-1',
      cursoTitulo: 'Curso demo',
      baseCentavos: 4000,
      moneda: 'USD',
      confirmadoAt: '2026-10-11T10:00:00.000Z',
    }
    const client = clientFake(async request => {
      requests.push(request)
      if (
        request.name === 'GetCommand' &&
        (request.input.Key as Record<string, unknown>).PK === 'EVENT#payment-event-1'
      )
        return {}
      if (
        request.name === 'GetCommand' &&
        (request.input.Key as Record<string, unknown>).PK === 'AFFILIATE#affiliate-1'
      ) {
        return {
          Item: {
            PK: 'AFFILIATE#affiliate-1',
            SK: 'PROFILE',
            entity: 'Affiliate',
            id: 'affiliate-1',
            usuarioId: 'seller-1',
            refId: 'ref-1',
            activo: true,
          },
        }
      }
      return {}
    })
    const repo = new DynamoAfiliadosRepository(client, 'affiliates')
    const envelope = {
      eventId: 'payment-event-1',
      eventType: 'payments.venta-referida-confirmada.v1',
      payload: sale,
    } as unknown as SobreEvento

    await repo.procesar(envelope)

    const transaction = requests.find(request => request.name === 'TransactWriteCommand')
    expect(transaction).toBeDefined()
    const operations = transaction?.input.TransactItems as Array<
      Record<string, { Item?: Record<string, unknown>; UpdateExpression?: string }>
    >
    expect(operations).toHaveLength(7)
    const commission = operations.find(operation => operation.Put?.Item?.entity === 'Commission')
      ?.Put?.Item
    const lookup = operations.find(operation => operation.Put?.Item?.entity === 'CommissionLookup')
      ?.Put?.Item
    expect(commission?.originalCentavos).toBe(200)
    expect(commission?.netoCentavos).toBe(200)
    expect(lookup?.PK).toBe('ORDER#order-1')
    expect(lookup?.affiliatePK).toBe('AFFILIATE#affiliate-1')
    expect(
      operations.some(operation => operation.Update?.UpdateExpression?.includes('totalCentavos')),
    ).toBe(true)
  })

  it('rechaza un nombre de tabla vacío', () => {
    expect(
      () =>
        new DynamoAfiliadosRepository(
          clientFake(async () => ({})),
          '  ',
        ),
    ).toThrow()
  })
})
