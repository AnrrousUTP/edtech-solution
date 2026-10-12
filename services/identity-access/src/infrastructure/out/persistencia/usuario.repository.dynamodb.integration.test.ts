import { afterAll, describe, expect, it } from 'bun:test'
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoRepository, UniqueId } from '@edtech/shared-kernel'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoUsuarioRepository } from './usuario.repository.dynamodb'
import { Usuario } from '../../../domain/entities/usuario.entity'
import { Email } from '../../../domain/value-objects/email.vo'

const endpoint = Bun.env.DYNAMODB_LOCAL_ENDPOINT
if (endpoint) {
  const tableName = `edtech-identity-test-${crypto.randomUUID()}`
  const client = new DynamoDBClient({
    endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  })
  const document = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
  })
  const repository = new DynamoUsuarioRepository(new DynamoRepository(document, tableName))
  const usuario = (id: string, email: string) => {
    const parsed = Email.crear(email)
    if (!parsed.ok) throw parsed.error
    return Usuario.crearDesdeCognito(UniqueId.nuevo(), parsed.value, id)
  }

  describe('DynamoUsuarioRepository · DynamoDB Local', () => {
    afterAll(async () => {
      try {
        await client.send(new DeleteTableCommand({ TableName: tableName }))
      } catch {
        // La tabla pudo no crearse si falló el setup.
      }
      client.destroy()
    })

    it('guarda y recupera perfiles, lista por índice y reserva email sin duplicados', async () => {
      await client.send(
        new CreateTableCommand({
          TableName: tableName,
          BillingMode: 'PAY_PER_REQUEST',
          AttributeDefinitions: [
            { AttributeName: 'PK', AttributeType: 'S' },
            { AttributeName: 'SK', AttributeType: 'S' },
            { AttributeName: 'GSI1PK', AttributeType: 'S' },
            { AttributeName: 'GSI1SK', AttributeType: 'S' },
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
          ],
        }),
      )

      const first = usuario('Estudiante uno', 'Demo@edtech.test')
      const firstEvents = first.pullEvents()
      const eventIds = firstEvents.map(event => event.eventId)
      await repository.guardar(first, firstEvents)
      const pendingOutbox = await document.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pending',
          ExpressionAttributeValues: { ':pending': 'OUTBOX#PENDING' },
        }),
      )
      expect(pendingOutbox.Items?.map(item => item.eventId)).toEqual(eventIds)
      const loaded = await repository.porId(first.id)
      expect(loaded?.email.valor).toBe('demo@edtech.test')
      expect(loaded?.nombreVisible).toBe('Estudiante uno')
      expect((await repository.todos()).map(item => item.id.valor)).toEqual([first.id.valor])

      const duplicate = usuario('Estudiante dos', 'demo@edtech.test')
      await expect(repository.guardar(duplicate, duplicate.pullEvents())).rejects.toBeDefined()
      expect(await repository.porId(duplicate.id)).toBeNull()
      expect((await repository.todos()).map(item => item.id.valor)).toEqual([first.id.valor])
      const outboxAfterCollision = await document.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pending',
          ExpressionAttributeValues: { ':pending': 'OUTBOX#PENDING' },
        }),
      )
      expect(outboxAfterCollision.Items).toHaveLength(1)
    }, 30_000)
  })
}
