import { afterAll, describe, expect, it } from 'bun:test'
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoMazoRepository } from './mazo.repository.dynamodb'
import { MazoFlashcards } from '../../../domain/entities/mazo-flashcards.entity'

const endpoint = Bun.env.DYNAMODB_LOCAL_ENDPOINT
if (endpoint) {
  const tableName = `edtech-flashcards-test-${crypto.randomUUID()}`
  const client = new DynamoDBClient({
    endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  })
  const repo = new DynamoMazoRepository(tableName, { endpoint, region: 'us-east-1' })

  describe('DynamoMazoRepository · DynamoDB Local', () => {
    afterAll(async () => {
      try {
        await client.send(new DeleteTableCommand({ TableName: tableName }))
      } catch {
        // La tabla pudo no crearse.
      }
      client.destroy()
    })

    it('conserva la revisión HITL, la caché y la transacción del outbox', async () => {
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
          GlobalSecondaryIndexes: ['GSI1', 'GSI2'].map(IndexName => ({
            IndexName,
            KeySchema: [
              { AttributeName: `${IndexName}PK`, KeyType: 'HASH' as const },
              { AttributeName: `${IndexName}SK`, KeyType: 'RANGE' as const },
            ],
            Projection: { ProjectionType: 'ALL' as const },
          })),
        }),
      )

      const mazo = MazoFlashcards.crear({
        tomoId: 'tomo-1',
        cursoId: 'curso-1',
        contenidoHash: 'hash-demo',
        version: 1,
        leccionesFuente: [
          { id: 'leccion-1', titulo: 'Introducción', bloquesS3Key: 'catalog/v1/lesson.json' },
        ],
      })
      await repo.guardar(mazo)
      expect((await repo.porTomoYHash('tomo-1', 'hash-demo'))?.id.valor).toBe(mazo.id.valor)
      expect(await repo.ultimaVersionDe('tomo-1')).toBe(1)

      mazo.recibirTarjetas(
        [{ anverso: 'Pregunta', reverso: 'Respuesta' }],
        'demo',
        new Date(),
        () => 'card-1',
      )
      const events = mazo.pullEvents()
      await repo.guardar(mazo, events)
      expect(await repo.porTomoParaEstudiante('tomo-1')).toHaveLength(0)

      mazo.aprobarTarjeta('card-1', 'admin-1', new Date())
      await repo.guardar(mazo, mazo.pullEvents())
      const studentCards = await repo.porTomoParaEstudiante('tomo-1')
      expect(studentCards.map(card => card.reverso)).toEqual(['Respuesta'])
      expect((await repo.porTomoParaAdmin('tomo-1'))[0]?.estado).toBe('PUBLICADO')

      const duplicate = MazoFlashcards.crear({
        tomoId: 'tomo-1',
        cursoId: 'curso-1',
        contenidoHash: 'hash-demo',
        version: 2,
        leccionesFuente: [],
      })
      await expect(repo.guardar(duplicate)).rejects.toBeDefined()
      expect(await repo.ultimaVersionDe('tomo-1')).toBe(1)
    }, 30_000)
  })
}
