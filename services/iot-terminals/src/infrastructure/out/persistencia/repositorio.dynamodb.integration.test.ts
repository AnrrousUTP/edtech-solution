import { afterAll, describe, expect, it } from 'bun:test'
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoTerminalRepository } from './repositorio.dynamodb'
import type { SobreEvento } from '@edtech/shared-kernel'

const endpoint = Bun.env.DYNAMODB_LOCAL_ENDPOINT
if (endpoint) {
  const tableName = `edtech-iot-test-${crypto.randomUUID()}`
  const client = new DynamoDBClient({
    endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  })
  const repo = new DynamoTerminalRepository(tableName, 'terminal-demo-01', 90_000, {
    endpoint,
    region: 'us-east-1',
  })

  const sobre = (
    eventId: string,
    eventType: string,
    payload: Record<string, unknown>,
    occurredAt = new Date().toISOString(),
  ) =>
    ({
      eventId,
      eventType,
      occurredAt,
      aggregateId: 'terminal-demo-01',
      correlationId: eventId,
      payload,
    }) as SobreEvento

  describe('DynamoTerminalRepository · DynamoDB Local', () => {
    afterAll(async () => {
      try {
        await client.send(new DeleteTableCommand({ TableName: tableName }))
      } catch {
        // La tabla pudo no crearse.
      }
      client.destroy()
    })

    it('administra afiliación, asignación, configuración, QR público y aviso idempotente', async () => {
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
      await repo.inicializar()
      const activatedAt = new Date().toISOString()
      await repo.procesar(
        sobre(
          'affiliate-1',
          'affiliates.afiliado-activado.v1',
          {
            usuarioId: 'seller-1',
            afiliadoId: 'affiliate-id-1',
            refId: 'ref-1',
          },
          activatedAt,
        ),
      )
      await repo.solicitar('seller-1')
      expect((await repo.mio('seller-1')).solicitud).toBe('SOLICITADA')
      await repo.asignar('seller-1')
      const assigned = await repo.mio('seller-1')
      expect(assigned.solicitud).toBe('ASIGNADA')
      expect(assigned.terminal?.refId).toBe('ref-1')
      expect(assigned.terminal?.previewToken).toMatch(/^[a-f0-9]{48}$/)

      const firstVersion = assigned.terminal!.version
      await expect(
        repo.configurar('seller-1', 'Mensaje', true, firstVersion - 1),
      ).rejects.toMatchObject({
        code: 'CONFIGURACION_CONFLICTO',
      })
      await repo.configurar('seller-1', 'Mensaje', true, firstVersion)
      await expect(repo.vista('terminal-demo-01', '0'.repeat(48))).rejects.toMatchObject({
        code: 'VISTA_NO_DISPONIBLE',
      })
      const publicView = await repo.vista('terminal-demo-01', assigned.terminal!.previewToken!)
      expect(publicView.mensaje).toBe('Mensaje')
      expect(publicView).not.toHaveProperty('previewToken')

      const saleAt = new Date().toISOString()
      const commission = sobre(
        'sale-1',
        'affiliates.comision-registrada.v1',
        {
          usuarioId: 'seller-1',
          ordenId: 'order-1',
        },
        saleAt,
      )
      await repo.procesar(commission)
      await repo.procesar(commission)
      expect(await repo.alertas()).toEqual([{ id: 'sale-1', texto: 'Nueva venta confirmada' }])

      const telemetry = sobre('telemetry-1', 'iot.telemetry.interno', {
        deviceId: 'terminal-demo-01',
        version: firstVersion + 1,
        alertId: 'sale-1',
      })
      await repo.procesar(telemetry)
      await repo.procesar(telemetry)
      const state = (await repo.mio('seller-1')).terminal!
      expect(state.conectado).toBe(true)
      expect(state.versionReportada).toBe(firstVersion + 1)
      expect(state.ultimoAviso).toBe('Nueva venta confirmada')
      expect(await repo.alertas()).toHaveLength(0)

      const admin = await repo.admin()
      expect(admin.terminales).toHaveLength(1)
      expect(admin.afiliados).toHaveLength(1)
    }, 30_000)
  })
}
