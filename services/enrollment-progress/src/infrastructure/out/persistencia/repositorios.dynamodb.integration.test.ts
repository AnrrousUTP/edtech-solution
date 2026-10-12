import { afterAll, describe, expect, it } from 'bun:test'
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { UniqueId } from '@edtech/shared-kernel'
import { IntentoEvaluacion } from '../../../domain/entities/intento-evaluacion.entity'
import { Matricula } from '../../../domain/entities/matricula.entity'
import {
  DynamoCursoProyeccionRepository,
  DynamoEnrollmentStore,
  DynamoIntentoRepository,
  DynamoMatriculaRepository,
} from './repositorios.dynamodb'

const endpoint = Bun.env.DYNAMODB_LOCAL_ENDPOINT
if (endpoint) {
  const tableName = `edtech-enrollment-test-${crypto.randomUUID()}`
  const client = new DynamoDBClient({
    endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  })
  const document = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  })
  const store = new DynamoEnrollmentStore(document, tableName)
  const matriculas = new DynamoMatriculaRepository(store)
  const intentos = new DynamoIntentoRepository(store)
  const proyecciones = new DynamoCursoProyeccionRepository(store)

  describe('DynamoEnrollmentRepositories · DynamoDB Local', () => {
    afterAll(async () => {
      try {
        await client.send(new DeleteTableCommand({ TableName: tableName }))
      } catch {
        /* tabla no creada */
      }
      client.destroy()
    })

    it('guarda una matrícula única, progreso granular, evaluación y eventos outbox en transacciones', async () => {
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
      const tomoId = crypto.randomUUID()
      const leccionId = crypto.randomUUID()
      await proyecciones.guardar({
        cursoId: cursoId.valor,
        titulo: 'Curso demo',
        slug: 'curso-demo',
        publicado: true,
        precio: 0,
        nivelMax: 'B',
        estructura: [
          {
            tomoId,
            orden: 1,
            titulo: 'Tomo 1',
            umbral: 70,
            lecciones: [{ id: leccionId, orden: 1 }],
          },
        ],
      })
      const curso = await proyecciones.porId(cursoId.valor)
      expect(curso?.tomoDeLeccion(leccionId)?.id).toBe(tomoId)

      const matricula = Matricula.gratuita(usuarioId, cursoId)
      await matriculas.guardar(matricula)
      expect((await matriculas.porUsuarioYCurso(usuarioId, cursoId))?.id.valor).toBe(
        matricula.id.valor,
      )

      const progreso = await matriculas.porId(matricula.id)
      expect(progreso?.completarLeccion(leccionId, curso!.tomos[0]!, new Date()).ok).toBe(true)
      await matriculas.guardar(progreso!)
      expect((await matriculas.porUsuario(usuarioId))[0]?.leccionesCompletadas.has(leccionId)).toBe(
        true,
      )

      const bancoId = UniqueId.nuevo()
      const intento = IntentoEvaluacion.iniciar({
        usuarioId,
        tipo: 'TOMO',
        bancoId,
        matriculaId: matricula.id,
        tomoId,
        ahora: new Date(),
      })
      await intentos.guardar(intento)
      const entregable = await intentos.porId(intento.id)
      expect(entregable?.estado).toBe('EN_CURSO')
      expect(
        entregable?.entregar(
          [{ preguntaId: 'q1', respuesta: 'correcta' }],
          [{ id: 'q1', respuestaCorrecta: 'correcta', puntaje: 1, nivel: 'A' }],
          70,
          new Date(),
        ).ok,
      ).toBe(true)
      const progresoEvaluacion = await matriculas.porId(matricula.id)
      expect(progresoEvaluacion?.intentarCompletarTomo(curso!.tomos[0]!, true, 100)).toBe(true)
      expect(progresoEvaluacion?.intentarCompletarCurso(curso!, new Date())).toBe(true)
      await intentos.guardarEntregaConProgreso(entregable!, progresoEvaluacion!)
      expect((await intentos.porId(intento.id))?.respuestas).toEqual([
        { preguntaId: 'q1', respuesta: 'correcta', correcta: true },
      ])
      expect(await matriculas.evaluacionAprobada(usuarioId, tomoId)).toEqual({
        aprobada: true,
        puntaje: 100,
      })

      expect(await matriculas.cursoYaCompletado(matricula.id)).toBe(true)
      expect(await matriculas.cursosCompletadosDe(usuarioId)).toContain(cursoId.valor)
      const yaCompletada = await matriculas.porId(matricula.id)
      expect(yaCompletada?.intentarCompletarCurso(curso!, new Date())).toBe(false)

      const outbox = await document.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: { ':pk': 'OUTBOX#PENDING' },
        }),
      )
      expect(outbox.Items?.filter(row => row.entity === 'Outbox').length).toBeGreaterThanOrEqual(3)
    }, 30_000)

    it('ignora duplicados y eventos de catálogo fuera de orden', async () => {
      const courseId = crypto.randomUUID()
      const entrada = {
        cursoId: courseId,
        titulo: 'Versión nueva',
        slug: 'curso-versionado',
        publicado: true,
        precio: 25,
        nivelMax: 'C',
        estructura: [
          { tomoId: crypto.randomUUID(), orden: 1, titulo: 'Tomo', umbral: 70, lecciones: [] },
        ],
      }
      const newest = {
        eventId: 'catalog-newest',
        eventType: 'catalog.curso-publicado.v1',
        occurredAt: '2026-10-11T12:00:00.000Z',
      }
      await proyecciones.guardar(entrada, newest)
      await proyecciones.guardar({ ...entrada, titulo: 'duplicado no debe sobreescribir' }, newest)
      await proyecciones.guardar(
        { ...entrada, titulo: 'evento viejo', precio: 2 },
        {
          eventId: 'catalog-old',
          eventType: 'catalog.curso-publicado.v1',
          occurredAt: '2026-10-10T12:00:00.000Z',
        },
      )
      expect(await proyecciones.porId(courseId)).toMatchObject({
        titulo: 'Versión nueva',
        precio: 25,
      })
      const marker = await document.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: 'EVENT#catalog-old', SK: 'PROCESSED' },
        }),
      )
      expect(marker.Item?.eventId).toBe('catalog-old')
    }, 30_000)
  })
}
