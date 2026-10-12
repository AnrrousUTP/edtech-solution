import { afterAll, describe, expect, it } from 'bun:test'
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { UniqueId } from '@edtech/shared-kernel'
import { Orden } from '../../../domain/entities/orden.entity'
import { Dinero } from '../../../domain/value-objects/dinero.vo'
import { DynamoPaymentsRepository, DynamoPrecioProyeccionRepository } from './repositorio.dynamodb'

const endpoint = Bun.env.DYNAMODB_LOCAL_ENDPOINT
if (endpoint) {
  const tableName = `edtech-payments-test-${crypto.randomUUID()}`
  const client = new DynamoDBClient({
    endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  })
  const document = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  })
  const orders = new DynamoPaymentsRepository(document, tableName)
  const prices = new DynamoPrecioProyeccionRepository(document, tableName)

  describe('DynamoPaymentsRepository · DynamoDB Local', () => {
    afterAll(async () => {
      try {
        await client.send(new DeleteTableCommand({ TableName: tableName }))
      } catch {
        // La tabla pudo no crearse si falló su esquema.
      }
      client.destroy()
    })

    it('conserva orden, llaves únicas, expiración, outbox y reembolsos sin duplicar', async () => {
      await client.send(
        new CreateTableCommand({
          TableName: tableName,
          BillingMode: 'PAY_PER_REQUEST',
          AttributeDefinitions: [
            { AttributeName: 'PK', AttributeType: 'S' },
            { AttributeName: 'SK', AttributeType: 'S' },
            { AttributeName: 'GSI1PK', AttributeType: 'S' },
            { AttributeName: 'GSI1SK', AttributeType: 'S' },
            { AttributeName: 'GSI2PK', AttributeType: 'S' },
            { AttributeName: 'GSI2SK', AttributeType: 'S' },
          ],
          KeySchema: [
            { AttributeName: 'PK', KeyType: 'HASH' },
            { AttributeName: 'SK', KeyType: 'RANGE' },
          ],
          GlobalSecondaryIndexes: ['GSI1', 'GSI2'].map(index => ({
            IndexName: index,
            KeySchema: [
              { AttributeName: `${index}PK`, KeyType: 'HASH' as const },
              { AttributeName: `${index}SK`, KeyType: 'RANGE' as const },
            ],
            Projection: { ProjectionType: 'ALL' as const },
          })),
        }),
      )

      const usuarioId = UniqueId.nuevo()
      const cursoId = UniqueId.nuevo()
      const ahora = new Date()
      const order = Orden.crear({
        usuarioId,
        cursoId,
        monto: Dinero.desdeCentavos(4000, 'USD'),
        versionPrecio: 3,
        ahora,
        expiraAt: new Date(ahora.getTime() + 60_000),
        cursoTitulo: 'Curso demo',
        atribucion: {
          afiliadoId: UniqueId.nuevo().valor,
          afiliadoUsuarioId: UniqueId.nuevo().valor,
          refId: UniqueId.nuevo().valor,
          visitaId: UniqueId.nuevo().valor,
          compradorId: usuarioId.valor,
          tasaBps: 500,
          politica: 'ultimo-referido-30d-v1',
        },
      })
      order.vincularConPasarela('PAYPAL-ORDER-1')
      await orders.guardar(order)
      expect((await orders.porPaypalOrderId('PAYPAL-ORDER-1'))?.id.valor).toBe(order.id.valor)
      expect((await orders.pendienteDe(usuarioId, cursoId))?.monto.centavos).toBe(4000)
      expect((await orders.porUsuario(usuarioId)).map(item => item.id.valor)).toEqual([
        order.id.valor,
      ])
      expect((await orders.todas()).map(item => item.id.valor)).toEqual([order.id.valor])
      expect(await orders.vencidas(new Date(ahora.getTime() + 120_000))).toHaveLength(1)

      order.confirmarCaptura({
        capturaId: 'PAYPAL-CAPTURE-1',
        comision: Dinero.desdeCentavos(200, 'USD'),
        neto: Dinero.desdeCentavos(3800, 'USD'),
        ahora: new Date(),
      })
      await orders.guardar(order)
      await orders.guardar(order)
      expect((await orders.porPaypalCaptureId('PAYPAL-CAPTURE-1'))?.estado).toBe('CAPTURADA')
      expect((await orders.capturadaDe(usuarioId, cursoId))?.id.valor).toBe(order.id.valor)
      expect(await orders.pendienteDe(usuarioId, cursoId)).toBeNull()
      const outbox = await document.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: { ':pk': 'OUTBOX#PENDING' },
        }),
      )
      expect(outbox.Items?.filter(item => item.entity === 'Outbox')).toHaveLength(3)

      expect(order.registrarReembolso('refund-part-1', Dinero.desdeCentavos(1000, 'USD'))).toBe(
        true,
      )
      await orders.guardar(order)
      expect((await orders.porId(order.id))?.reembolsos).toEqual([
        { id: 'refund-part-1', centavos: 1000 },
      ])
      expect(order.registrarReembolso('refund-part-2', Dinero.desdeCentavos(3000, 'USD'))).toBe(
        true,
      )
      await orders.guardar(order)
      expect((await orders.porId(order.id))?.estado).toBe('REEMBOLSADA')
      expect(await orders.capturadaDe(usuarioId, cursoId)).toBeNull()
    }, 30_000)

    it('proyecta precios y registra la idempotencia del evento en la misma transacción', async () => {
      const price = {
        cursoId: 'course-demo',
        titulo: 'Curso demo',
        monto: 40,
        moneda: 'USD',
        versionPrecio: 2,
        publicado: true,
      }
      const event = { eventId: 'course-published-2', eventType: 'catalog.curso-publicado.v1' }
      await prices.guardar(price, event)
      await prices.guardar({ ...price, monto: 9 }, event)
      await prices.guardar(
        { ...price, versionPrecio: 1, monto: 1 },
        {
          eventId: 'old-price-event',
          eventType: 'catalog.precio-actualizado.v1',
        },
      )
      expect(await prices.porCursoId(price.cursoId)).toMatchObject({ monto: 40, versionPrecio: 2 })
      const marker = await document.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': 'EVENT#course-published-2' },
        }),
      )
      expect(marker.Items).toHaveLength(1)
    }, 30_000)
  })
}
