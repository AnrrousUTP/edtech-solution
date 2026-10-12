import { afterAll, describe, expect, it } from 'bun:test'
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { DynamoAfiliadosRepository } from './repositorio.dynamodb'
import type { SobreEvento } from '@edtech/shared-kernel'

const endpoint = Bun.env.DYNAMODB_LOCAL_ENDPOINT
if (endpoint) {
  const tableName = `edtech-affiliates-test-${crypto.randomUUID()}`
  const client = new DynamoDBClient({
    endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  })
  const document = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  })
  const repo = new DynamoAfiliadosRepository(document, tableName)

  describe('DynamoAfiliadosRepository · DynamoDB Local', () => {
    afterAll(async () => {
      try {
        await client.send(new DeleteTableCommand({ TableName: tableName }))
      } catch {
        /* la tabla pudo no crearse */
      }
      client.destroy()
    })

    it('completa QR → atribución → comisión única → ajuste por reembolso', async () => {
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
          GlobalSecondaryIndexes: [
            {
              IndexName: 'GSI1',
              KeySchema: [
                { AttributeName: 'GSI1PK', KeyType: 'HASH' },
                { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
              ],
              Projection: { ProjectionType: 'ALL' },
            },
            {
              IndexName: 'GSI2',
              KeySchema: [
                { AttributeName: 'GSI2PK', KeyType: 'HASH' },
                { AttributeName: 'GSI2SK', KeyType: 'RANGE' },
              ],
              Projection: { ProjectionType: 'ALL' },
            },
          ],
        }),
      )

      const affiliate = await repo.activar('seller-1')
      const visit = await repo.visitar(affiliate.refId)
      expect(visit.destino).toBe('/cursos')
      const attributed = await repo.atribuir('buyer-1', visit.visitaId)
      expect(attributed?.afiliadoId).toBe(affiliate.id)

      const sale = {
        ...attributed!,
        ordenId: 'order-1',
        cursoId: 'course-1',
        cursoTitulo: 'Curso demo',
        baseCentavos: 4000,
        moneda: 'USD',
        confirmadoAt: new Date().toISOString(),
      }
      const saleEvent = {
        eventId: 'payment-event-1',
        eventType: 'payments.venta-referida-confirmada.v1',
        payload: sale,
      } as unknown as SobreEvento
      await repo.procesar(saleEvent)
      await repo.procesar(saleEvent)
      let summary = await repo.resumen('seller-1')
      expect(summary.totalCentavos).toBe(200)
      expect(summary.ventas).toBe(1)
      expect(summary.visitas).toBe(1)

      await repo.procesar({
        eventId: 'refund-event-1',
        eventType: 'payments.pago-reembolsado.v1',
        payload: { ordenId: 'order-1', reembolsoId: 'refund-1', monto: 10 },
      } as unknown as SobreEvento)
      summary = await repo.resumen('seller-1')
      expect(summary.totalCentavos).toBe(150)
      const notifications = await repo.notificaciones('seller-1')
      expect(notifications).toHaveLength(2)
      expect(notifications.some(item => String(item.mensaje).includes('reembolso'))).toBe(true)
    }, 30_000)
  })
}
