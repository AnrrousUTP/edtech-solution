import { afterAll, describe, expect, it } from 'bun:test'
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoRepository, UniqueId } from '@edtech/shared-kernel'
import { Certificado } from '../../../domain/entities/certificado.entity'
import { PerfilGamificacion } from '../../../domain/entities/perfil-gamificacion.entity'
import { CodigoVerificacion } from '../../../domain/value-objects/codigo-verificacion.vo'
import { DynamoCertificadoRepository, DynamoPerfilRepository } from './repositorios.dynamodb'

const endpoint = Bun.env.DYNAMODB_LOCAL_ENDPOINT

const valor = <T, E extends Error>(
  resultado: { ok: true; value: T } | { ok: false; error: E },
): T => {
  if (!resultado.ok) throw resultado.error
  return resultado.value
}

if (endpoint) {
  const tableName = `edtech-gamification-test-${crypto.randomUUID()}`
  const client = new DynamoDBClient({
    endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  })
  const document = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
  })
  const tabla = new DynamoRepository(document, tableName)
  const perfiles = new DynamoPerfilRepository(tabla)
  const certificados = new DynamoCertificadoRepository(document, tableName)

  describe('Repositorios de gamificación · DynamoDB Local', () => {
    afterAll(async () => {
      try {
        await client.send(new DeleteTableCommand({ TableName: tableName }))
      } catch {
        // La tabla pudo no crearse.
      }
      client.destroy()
    })

    it('guarda perfiles, insignias, certificados, índices y outbox', async () => {
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
      const perfil = PerfilGamificacion.crear(usuarioId)
      perfil.fijarNombreTitular('Estudiante de prueba')
      perfil.sumarPuntos(40)
      perfil.otorgarInsignia('PRIMER_CURSO', crypto.randomUUID(), new Date('2026-10-20T12:00:00Z'))
      await perfiles.guardar(perfil)

      const actualizado = await perfiles.porUsuario(usuarioId)
      expect(actualizado?.puntos).toBe(40)
      expect(actualizado?.insignias).toHaveLength(1)
      actualizado?.sumarPuntos(10)
      if (actualizado) await perfiles.guardar(actualizado)
      expect((await perfiles.porUsuario(usuarioId))?.puntos).toBe(50)
      expect((await perfiles.todos()).map(item => item.usuarioId.valor)).toContain(usuarioId.valor)

      const referenciaId = crypto.randomUUID()
      const codigo = valor(CodigoVerificacion.crear('EDT-ABCD-EFGH'))
      const certificado = Certificado.emitir({
        usuarioId,
        tipo: 'MENOR',
        referenciaId,
        titulo: 'Curso inicial',
        nombreTitular: 'Estudiante de prueba',
        codigo,
        ahora: new Date('2026-10-20T12:00:00Z'),
      })
      await certificados.guardar(certificado)

      expect((await certificados.porId(certificado.id))?.codigo.valor).toBe(codigo.valor)
      expect((await certificados.porCodigo(codigo.valor))?.id.valor).toBe(certificado.id.valor)
      expect((await certificados.porReferencia(usuarioId, 'MENOR', referenciaId))?.id.valor).toBe(
        certificado.id.valor,
      )
      expect((await certificados.porUsuario(usuarioId)).map(item => item.id.valor)).toContain(
        certificado.id.valor,
      )

      const outbox = await document.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: { ':pk': 'OUTBOX#PENDING' },
        }),
      )
      expect(
        outbox.Items?.some(item => item.eventType === 'gamification.insignia-otorgada.v1'),
      ).toBe(true)
      expect(
        outbox.Items?.some(item => item.eventType === 'gamification.certificado-emitido.v1'),
      ).toBe(true)
    }, 30_000)
  })
}
