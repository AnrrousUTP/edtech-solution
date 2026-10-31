import { afterAll, describe, expect, it } from 'bun:test'
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { BancoPreguntas } from '../../../domain/entities/banco-preguntas.entity'
import { Carrera } from '../../../domain/entities/carrera.entity'
import { Curso, type TomoInfo } from '../../../domain/entities/curso.entity'
import { Dinero } from '../../../domain/value-objects/dinero.vo'
import { Nivel } from '../../../domain/value-objects/nivel.vo'
import { Slug } from '../../../domain/value-objects/slug.vo'
import { DynamoCatalogStore } from './repositorios.dynamodb'

const endpoint = Bun.env.DYNAMODB_LOCAL_ENDPOINT

const valor = <T, E extends Error>(
  resultado: { ok: true; value: T } | { ok: false; error: E },
): T => {
  if (!resultado.ok) throw resultado.error
  return resultado.value
}

if (endpoint) {
  const tableName = `edtech-catalog-test-${crypto.randomUUID()}`
  const client = new DynamoDBClient({
    endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  })
  const document = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
  })
  const store = new DynamoCatalogStore(
    document,
    tableName,
    // Las operaciones de estos casos cubren persistencia del catálogo, no S3.
    {} as never,
    'edtech-media-local',
  )

  describe('DynamoCatalogStore · DynamoDB Local', () => {
    afterAll(async () => {
      try {
        await client.send(new DeleteTableCommand({ TableName: tableName }))
      } catch {
        // La tabla pudo no crearse.
      }
      client.destroy()
    })

    it('crea y consulta curso publicado, carrera, banco y outbox', async () => {
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

      const tomo: TomoInfo = {
        id: crypto.randomUUID(),
        orden: 1,
        titulo: 'Fundamentos',
        descripcion: null,
        umbral: 70,
        lecciones: [
          {
            id: crypto.randomUUID(),
            orden: 1,
            titulo: 'Primera lección',
            duracionMin: 10,
            contenidoHash: 'contenido-v1',
          },
        ],
      }
      const curso = valor(
        Curso.crear({
          slug: valor(Slug.crear(`curso-${crypto.randomUUID()}`)),
          titulo: 'Curso de migración',
          descripcion: 'Persistencia destino',
          tecnologia: 'TypeScript',
          nivelMin: valor(Nivel.crear('A')),
          nivelMax: valor(Nivel.crear('C')),
          precio: valor(Dinero.crear(10, 'USD')),
        }),
      )
      valor(curso.reemplazarTomos([tomo]))
      valor(curso.publicar(new Date('2026-10-20T12:00:00.000Z')))
      await store.guardarCurso(curso)

      const detalle = await store.cursoPorSlug(curso.slug.valor, false)
      expect(detalle?.id).toBe(curso.id.valor)
      expect(detalle?.tomos[0]?.lecciones[0]?.id).toBe(tomo.lecciones[0]?.id)
      expect((await store.listarCursos(false)).map(c => c.id)).toContain(curso.id.valor)

      const carrera = Carrera.crear({
        slug: valor(Slug.crear(`ruta-${crypto.randomUUID()}`)),
        titulo: 'Ruta inicial',
        descripcion: 'Ruta para validar persistencia',
      })
      valor(carrera.reemplazarCursos([{ cursoId: curso.id.valor, orden: 1 }]))
      carrera.publicar()
      await store.guardarCarrera(carrera)
      expect((await store.listarCarreras(false)).map(c => c.id)).toContain(carrera.id.valor)

      const banco = valor(
        BancoPreguntas.crear({
          uso: 'EVALUACION_TOMO',
          tomoId: tomo.id,
          cursoId: null,
          titulo: 'Evaluación del tomo',
        }),
      )
      valor(
        banco.agregarPregunta({
          tipo: 'OPCION_UNICA',
          nivel: null,
          enunciado: '¿Qué lenguaje usa el curso?',
          opciones: [{ id: 'a', texto: 'TypeScript' }],
          respuestaCorrecta: 'a',
          puntaje: 1,
        }),
      )
      await store.guardarBanco(banco)
      expect((await store.bancoPorUso('EVALUACION_TOMO', tomo.id))?.id.valor).toBe(banco.id.valor)
      expect((await store.listarBancosAdmin()).map(b => b.bancoId)).toContain(banco.id.valor)

      const outbox = await document.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: { ':pk': 'OUTBOX#PENDING' },
        }),
      )
      expect(outbox.Items?.some(item => item.eventType === 'catalog.curso-publicado.v1')).toBe(true)
    }, 30_000)
  })
}
