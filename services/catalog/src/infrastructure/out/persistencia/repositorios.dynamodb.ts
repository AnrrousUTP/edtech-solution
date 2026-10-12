import {
  DynamoRepository,
  assertDynamoItemSize,
  type DynamoItem,
  type DomainEvent,
  UniqueId,
} from '@edtech/shared-kernel'
import {
  DynamoDBDocumentClient,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import {
  BancoPreguntas,
  type Pregunta,
  type UsoBanco,
} from '../../../domain/entities/banco-preguntas.entity'
import { Carrera, type CursoEnCarrera } from '../../../domain/entities/carrera.entity'
import { Curso, type LeccionInfo, type TomoInfo } from '../../../domain/entities/curso.entity'
import type { BancoRepository } from '../../../domain/ports-out/banco.repository'
import type { CarreraRepository } from '../../../domain/ports-out/carrera.repository'
import type { Bloque, CursoRepository, Ejercicio } from '../../../domain/ports-out/curso.repository'
import type { ContenidoStore } from '../../../domain/ports-out/contenido-store.port'
import type {
  CarreraResumen,
  CatalogoLectura,
  CursoDetalle,
  CursoResumen,
  EvaluacionPublica,
  LeccionContenido,
  RespuestasBanco,
} from '../../../domain/ports-out/catalogo-lectura.port'
import { Dinero } from '../../../domain/value-objects/dinero.vo'
import { Nivel } from '../../../domain/value-objects/nivel.vo'
import { Slug } from '../../../domain/value-objects/slug.vo'

type Row = DynamoItem & Record<string, unknown>
type PageCursor = Record<string, unknown>
type Operations = NonNullable<TransactWriteCommandInput['TransactItems']>
const courseKey = (id: string) => ({ PK: `COURSE#${id}`, SK: 'PROFILE' })
const careerKey = (id: string) => ({ PK: `CAREER#${id}`, SK: 'PROFILE' })
const bankKey = (id: string) => ({ PK: `BANK#${id}`, SK: 'PROFILE' })
const slugKey = (slug: string) => ({ PK: `COURSE_SLUG#${slug}`, SK: 'LOOKUP' })
const parseDate = (date: unknown): Date | null =>
  typeof date === 'string' && date ? new Date(date) : null
const jsonCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const eventRows = (table: string, events: DomainEvent[]) =>
  events.map(event => ({
    Put: {
      TableName: table,
      Item: {
        PK: `OUTBOX#${event.eventId}`,
        SK: 'EVENT',
        entity: 'Outbox',
        eventId: event.eventId,
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        occurredAt: event.occurredAt.toISOString(),
        payload: event.payload(),
        createdAt: new Date().toISOString(),
        expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        GSI1PK: 'OUTBOX#PENDING',
        GSI1SK: `${event.occurredAt.toISOString()}#${event.eventId}`,
      },
      ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    },
  }))

/** Repositorios del catálogo sobre su tabla DynamoDB y almacenamiento de lecciones en S3. */
export class DynamoCatalogStore implements CatalogoLectura, ContenidoStore {
  private readonly dynamo: DynamoRepository

  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly s3: S3Client,
    private readonly contentBucket: string,
  ) {
    if (!tableName.trim() || !contentBucket.trim())
      throw new Error('Configuración de catálogo incompleta')
    this.dynamo = new DynamoRepository(client, tableName)
  }

  private async get(key: { PK: string; SK: string }, consistentRead = true): Promise<Row | null> {
    return this.dynamo.get<Row>(key, consistentRead)
  }

  private cursoDesde(row: Row): Curso {
    const slug = Slug.crear(String(row.slug))
    const nivelMin = Nivel.crear(String(row.nivelMin))
    const nivelMax = Nivel.crear(String(row.nivelMax))
    const precio = Dinero.crear(Number(row.precio), String(row.moneda))
    if (!slug.ok || !nivelMin.ok || !nivelMax.ok || !precio.ok)
      throw new Error(`Registro de curso ${String(row.id)} inválido`)
    return Curso.reconstruir({
      id: UniqueId.desde(String(row.id)),
      slug: slug.value,
      titulo: String(row.titulo),
      descripcion: String(row.descripcion ?? ''),
      tecnologia: String(row.tecnologia ?? ''),
      nivelMin: nivelMin.value,
      nivelMax: nivelMax.value,
      precio: precio.value,
      versionPrecio: Number(row.versionPrecio ?? 1),
      imagenUrl: typeof row.imagenUrl === 'string' ? row.imagenUrl : null,
      estado: row.estado,
      publicadoAt: parseDate(row.publicadoAt),
      tomos: Array.isArray(row.tomos) ? row.tomos : [],
    } as never)
  }

  async cursoPorIdAggregate(id: UniqueId): Promise<Curso | null> {
    const row = await this.get(courseKey(id.valor))
    return row ? this.cursoDesde(row) : null
  }

  async porSlug(slug: string): Promise<Curso | null> {
    const lookup = await this.get(slugKey(slug))
    if (typeof lookup?.cursoId !== 'string') return null
    return this.cursoPorIdAggregate(UniqueId.desde(lookup.cursoId))
  }

  async guardarCurso(curso: Curso): Promise<void> {
    const key = courseKey(curso.id.valor)
    const actual = await this.get(key)
    const slugLookup = await this.get(slugKey(curso.slug.valor))
    if (slugLookup && slugLookup.cursoId !== curso.id.valor)
      throw new Error(`El slug ${curso.slug.valor} ya está reservado`)
    const now = new Date().toISOString()
    const row: Row = {
      ...key,
      entity: 'Course',
      id: curso.id.valor,
      slug: curso.slug.valor,
      titulo: curso.titulo,
      descripcion: curso.descripcion,
      tecnologia: curso.tecnologia,
      nivelMin: curso.nivelMin.valor,
      nivelMax: curso.nivelMax.valor,
      precio: curso.precio.monto,
      moneda: curso.precio.moneda,
      versionPrecio: curso.versionPrecio,
      imagenUrl: curso.imagenUrl,
      estado: curso.estado,
      publicadoAt: curso.publicadoAt?.toISOString() ?? null,
      tomos: jsonCopy(curso.tomos),
      version: Number(actual?.version ?? 0) + 1,
      createdAt: String(actual?.createdAt ?? now),
      updatedAt: now,
      GSI1PK: `COURSES#${curso.estado}`,
      GSI1SK: `${String(actual?.createdAt ?? now)}#${curso.id.valor}`,
      GSI2PK: `COURSES#ALL`,
      GSI2SK: `${String(actual?.createdAt ?? now)}#${curso.id.valor}`,
    }
    assertDynamoItemSize(row)
    const operations: Operations = [
      {
        Put: {
          TableName: this.tableName,
          Item: row,
          ...(actual
            ? {
                ConditionExpression: 'version = :version',
                ExpressionAttributeValues: { ':version': actual.version },
              }
            : { ConditionExpression: 'attribute_not_exists(PK)' }),
        },
      },
    ]
    if (!slugLookup)
      operations.push({
        Put: {
          TableName: this.tableName,
          Item: { ...slugKey(curso.slug.valor), entity: 'CourseSlug', cursoId: curso.id.valor },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      })
    const events = curso.pullEvents()
    operations.push(...eventRows(this.tableName, events))
    await this.dynamo.transact(operations)
  }

  async reemplazarBloques(leccionId: UniqueId, bloques: Bloque[]): Promise<void> {
    const pk = `LESSON#${leccionId.valor}`
    const existentes = await this.queryPartition(pk, 'BLOCK#')
    const operations: Operations = [
      ...existentes.map(row => ({
        Delete: { TableName: this.tableName, Key: { PK: pk, SK: row.SK } },
      })),
      ...bloques.map((block, index) => ({
        Put: {
          TableName: this.tableName,
          Item: {
            PK: pk,
            SK: `BLOCK#${String(block.orden).padStart(5, '0')}`,
            entity: 'LessonBlock',
            orden: block.orden ?? index + 1,
            tipo: block.tipo,
            contenido: block.contenido,
          },
        },
      })),
    ]
    if (operations.length > 100)
      throw new RangeError('La lección excede el límite de 100 escrituras DynamoDB')
    if (operations.length) await this.dynamo.transact(operations)
  }

  async bloquesDe(leccionId: UniqueId): Promise<Bloque[]> {
    return (await this.queryPartition(`LESSON#${leccionId.valor}`, 'BLOCK#')).map(row => ({
      orden: Number(row.orden),
      tipo: String(row.tipo),
      contenido: row.contenido as Record<string, unknown>,
    }))
  }

  async reemplazarEjercicios(leccionId: UniqueId, ejercicios: Ejercicio[]): Promise<void> {
    const pk = `LESSON#${leccionId.valor}`
    const existentes = await this.queryPartition(pk, 'EXERCISE#')
    const operations: Operations = [
      ...existentes.map(row => ({
        Delete: { TableName: this.tableName, Key: { PK: pk, SK: row.SK } },
      })),
      ...ejercicios.map((exercise, index) => ({
        Put: {
          TableName: this.tableName,
          Item: {
            PK: pk,
            SK: `EXERCISE#${String(exercise.id ?? index).padStart(5, '0')}`,
            entity: 'LessonExercise',
            id: exercise.id ?? `${index}`,
            enunciado: exercise.enunciado,
            solucionEsperada: exercise.solucionEsperada,
            pistas: exercise.pistas,
          },
        },
      })),
    ]
    if (operations.length > 100)
      throw new RangeError('La lección excede el límite de 100 escrituras DynamoDB')
    if (operations.length) await this.dynamo.transact(operations)
  }

  async ejerciciosDe(leccionId: UniqueId): Promise<Ejercicio[]> {
    return (await this.queryPartition(`LESSON#${leccionId.valor}`, 'EXERCISE#')).map(row => ({
      id: String(row.id),
      enunciado: String(row.enunciado),
      solucionEsperada: row.solucionEsperada as Record<string, unknown>,
      pistas: Array.isArray(row.pistas) ? row.pistas : [],
    }))
  }

  private carreraDesde(row: Row): Carrera {
    const slug = Slug.crear(String(row.slug))
    if (!slug.ok) throw new Error(`Registro de carrera ${String(row.id)} inválido`)
    return Carrera.reconstruir({
      id: UniqueId.desde(String(row.id)),
      slug: slug.value,
      titulo: String(row.titulo),
      descripcion: String(row.descripcion ?? ''),
      imagenUrl: typeof row.imagenUrl === 'string' ? row.imagenUrl : null,
      estado: row.estado,
      cursos: Array.isArray(row.cursos) ? row.cursos : [],
    } as never)
  }

  async carreraPorId(id: UniqueId): Promise<Carrera | null> {
    const row = await this.get(careerKey(id.valor))
    return row ? this.carreraDesde(row) : null
  }

  async todas(): Promise<Carrera[]> {
    return (await this.queryIndex('GSI2', 'CAREERS#ALL')).map(row => this.carreraDesde(row))
  }

  async guardarCarrera(carrera: Carrera): Promise<void> {
    const key = careerKey(carrera.id.valor)
    const actual = await this.get(key)
    const now = new Date().toISOString()
    const row: Row = {
      ...key,
      entity: 'Career',
      id: carrera.id.valor,
      slug: carrera.slug.valor,
      titulo: carrera.titulo,
      descripcion: carrera.descripcion,
      imagenUrl: carrera.imagenUrl,
      estado: carrera.estado,
      cursos: jsonCopy(carrera.cursos),
      version: Number(actual?.version ?? 0) + 1,
      createdAt: String(actual?.createdAt ?? now),
      updatedAt: now,
      GSI1PK: `CAREERS#${carrera.estado}`,
      GSI1SK: `${String(actual?.createdAt ?? now)}#${carrera.id.valor}`,
      GSI2PK: 'CAREERS#ALL',
      GSI2SK: `${String(actual?.createdAt ?? now)}#${carrera.id.valor}`,
    }
    assertDynamoItemSize(row)
    await this.dynamo.transact([
      {
        Put: {
          TableName: this.tableName,
          Item: row,
          ...(actual
            ? {
                ConditionExpression: 'version = :version',
                ExpressionAttributeValues: { ':version': actual.version },
              }
            : { ConditionExpression: 'attribute_not_exists(PK)' }),
        },
      },
    ])
  }

  private bancoDesde(row: Row): BancoPreguntas {
    return BancoPreguntas.reconstruir({
      id: UniqueId.desde(String(row.id)),
      uso: row.uso,
      tomoId: typeof row.tomoId === 'string' ? row.tomoId : null,
      titulo: String(row.titulo),
      preguntas: Array.isArray(row.preguntas) ? row.preguntas : [],
    } as never)
  }

  async bancoPorId(id: UniqueId): Promise<BancoPreguntas | null> {
    const row = await this.get(bankKey(id.valor))
    return row ? this.bancoDesde(row) : null
  }

  async bancoPorUso(uso: UsoBanco, tomoId?: string): Promise<BancoPreguntas | null> {
    const rows = tomoId
      ? await this.queryIndex('GSI2', `TOMO#${tomoId}`, `USO#${uso}#`)
      : await this.queryIndex('GSI1', `BANK_USE#${uso}`)
    return rows[0] ? this.bancoDesde(rows[0]) : null
  }

  async guardarBanco(banco: BancoPreguntas): Promise<void> {
    const key = bankKey(banco.id.valor)
    const actual = await this.get(key)
    const now = new Date().toISOString()
    const row: Row = {
      ...key,
      entity: 'QuestionBank',
      id: banco.id.valor,
      uso: banco.uso,
      tomoId: banco.tomoId,
      titulo: banco.titulo,
      preguntas: jsonCopy(banco.preguntas),
      version: Number(actual?.version ?? 0) + 1,
      createdAt: String(actual?.createdAt ?? now),
      updatedAt: now,
      GSI1PK: `BANK_USE#${banco.uso}`,
      GSI1SK: `${banco.titulo.toLowerCase()}#${banco.id.valor}`,
      ...(banco.tomoId
        ? { GSI2PK: `TOMO#${banco.tomoId}`, GSI2SK: `USO#${banco.uso}#${banco.id.valor}` }
        : {}),
    }
    assertDynamoItemSize(row)
    await this.dynamo.transact([
      {
        Put: {
          TableName: this.tableName,
          Item: row,
          ...(actual
            ? {
                ConditionExpression: 'version = :version',
                ExpressionAttributeValues: { ':version': actual.version },
              }
            : { ConditionExpression: 'attribute_not_exists(PK)' }),
        },
      },
    ])
  }

  private async queryIndex(
    index: 'GSI1' | 'GSI2',
    partition: string,
    prefix?: string,
  ): Promise<Row[]> {
    const rows: Row[] = []
    let cursor: PageCursor | undefined
    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: index,
          KeyConditionExpression: prefix
            ? `${index}PK = :pk AND begins_with(${index}SK, :sk)`
            : `${index}PK = :pk`,
          ExpressionAttributeValues: { ':pk': partition, ...(prefix ? { ':sk': prefix } : {}) },
          Limit: 100,
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      )
      rows.push(...((result.Items ?? []) as Row[]))
      cursor = result.LastEvaluatedKey as PageCursor | undefined
    } while (cursor)
    return rows
  }

  private async queryPartition(pk: string, prefix: string): Promise<Row[]> {
    const rows: Row[] = []
    let cursor: PageCursor | undefined
    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
          Limit: 100,
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      )
      rows.push(...((result.Items ?? []) as Row[]))
      cursor = result.LastEvaluatedKey as PageCursor | undefined
    } while (cursor)
    return rows
  }

  private resumen(row: Row): CursoResumen {
    return {
      id: String(row.id),
      slug: String(row.slug),
      titulo: String(row.titulo),
      descripcion: String(row.descripcion ?? ''),
      tecnologia: String(row.tecnologia ?? ''),
      nivelMin: String(row.nivelMin),
      nivelMax: String(row.nivelMax),
      precio: Number(row.precio),
      moneda: String(row.moneda),
      imagenUrl: typeof row.imagenUrl === 'string' ? row.imagenUrl : null,
      estado: String(row.estado),
      publicadoAt: parseDate(row.publicadoAt)?.toISOString() ?? null,
    }
  }

  async listarCursos(incluirNoPublicados: boolean): Promise<CursoResumen[]> {
    const estados = incluirNoPublicados ? ['BORRADOR', 'PUBLICADO', 'DESPUBLICADO'] : ['PUBLICADO']
    const rows = (
      await Promise.all(estados.map(state => this.queryIndex('GSI1', `COURSES#${state}`)))
    ).flat()
    return rows
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .map(row => this.resumen(row))
  }

  private async getCursoDetalle(row: Row): Promise<CursoDetalle> {
    const course = this.cursoDesde(row)
    return {
      ...this.resumen(row),
      versionPrecio: course.versionPrecio,
      tomos: await Promise.all(
        course.tomos.map(async tomo => ({
          id: tomo.id,
          orden: tomo.orden,
          titulo: tomo.titulo,
          descripcion: tomo.descripcion,
          umbral: tomo.umbral,
          materiales: [],
          lecciones: tomo.lecciones.map(leccion => ({
            id: leccion.id,
            orden: leccion.orden,
            titulo: leccion.titulo,
            duracionMin: leccion.duracionMin,
          })),
        })),
      ),
    }
  }

  async cursoPorSlug(slug: string, incluirNoPublicados: boolean): Promise<CursoDetalle | null> {
    const course = await this.porSlug(slug)
    if (!course || (!incluirNoPublicados && course.estado !== 'PUBLICADO')) return null
    return this.getCursoDetalle((await this.get(courseKey(course.id.valor)))!)
  }

  async cursoPorId(id: string, incluirNoPublicados: boolean): Promise<CursoDetalle | null> {
    const row = await this.get(courseKey(id))
    if (!row || (!incluirNoPublicados && row.estado !== 'PUBLICADO')) return null
    return this.getCursoDetalle(row)
  }

  async leccionContenido(leccionId: string): Promise<LeccionContenido | null> {
    const rows = await this.queryIndex('GSI2', 'COURSES#ALL')
    const course = rows.find(
      row =>
        Array.isArray(row.tomos) &&
        row.tomos.some((tomo: TomoInfo) => tomo.lecciones.some(lesson => lesson.id === leccionId)),
    )
    if (!course || course.estado !== 'PUBLICADO') return null
    const tomo = (course.tomos as TomoInfo[]).find(candidate =>
      candidate.lecciones.some(lesson => lesson.id === leccionId),
    )!
    const lesson = tomo.lecciones.find(candidate => candidate.id === leccionId)!
    const blocks = await this.bloquesDe(UniqueId.desde(leccionId))
    const exercises = await this.ejerciciosDe(UniqueId.desde(leccionId))
    return {
      id: lesson.id,
      titulo: lesson.titulo,
      tomoId: tomo.id,
      bloques: blocks.map(({ orden, tipo, contenido }) => ({ orden, tipo, contenido })),
      ejercicios: exercises.map(exercise => ({
        id: exercise.id ?? '',
        enunciado: exercise.enunciado,
        pistas: exercise.pistas,
      })),
    }
  }

  async evaluacionDeTomo(tomoId: string): Promise<EvaluacionPublica | null> {
    const bank = await this.bancoPorUso('EVALUACION_TOMO', tomoId)
    if (!bank) return null
    const course = await this.findPublishedCourseForTomo(tomoId)
    const threshold = course?.tomos.find(tomo => tomo.id === tomoId)?.umbral ?? 70
    return this.evaluacionPublica(bank, threshold)
  }

  async nivelacion(): Promise<EvaluacionPublica | null> {
    const bank = await this.bancoPorUso('NIVELACION')
    return bank ? this.evaluacionPublica(bank, 60) : null
  }

  async respuestasDeBanco(bancoId: string): Promise<RespuestasBanco | null> {
    const bank = await this.get(bankKey(bancoId))
    if (!bank) return null
    const questions = bank.preguntas as Pregunta[]
    return {
      bancoId: String(bank.id),
      uso: String(bank.uso),
      tomoId: typeof bank.tomoId === 'string' ? bank.tomoId : null,
      umbral:
        bank.uso === 'NIVELACION'
          ? null
          : ((await this.findPublishedCourseForTomo(String(bank.tomoId)))?.tomos.find(
              t => t.id === bank.tomoId,
            )?.umbral ?? 70),
      preguntas: questions.map(question => ({
        id: question.id,
        tipo: question.tipo,
        enunciado: question.enunciado,
        opciones: question.opciones,
        puntaje: question.puntaje,
        respuestaCorrecta: question.respuestaCorrecta,
        nivel: question.nivel,
      })),
    }
  }

  private evaluacionPublica(bank: BancoPreguntas, umbral: number): EvaluacionPublica {
    return {
      bancoId: bank.id.valor,
      titulo: bank.titulo,
      umbral,
      preguntas: bank.preguntas.map(question => ({
        id: question.id,
        tipo: question.tipo,
        enunciado: question.enunciado,
        opciones: question.opciones,
        puntaje: question.puntaje,
      })),
    }
  }

  private async findPublishedCourseForTomo(tomoId: string): Promise<Curso | null> {
    for (const row of await this.queryIndex('GSI1', 'COURSES#PUBLICADO')) {
      const course = this.cursoDesde(row)
      if (course.tomos.some(tomo => tomo.id === tomoId)) return course
    }
    return null
  }

  async listarCarreras(incluirNoPublicadas: boolean): Promise<CarreraResumen[]> {
    const states = incluirNoPublicadas ? ['BORRADOR', 'PUBLICADO'] : ['PUBLICADO']
    const rows = (
      await Promise.all(states.map(state => this.queryIndex('GSI1', `CAREERS#${state}`)))
    ).flat()
    return rows.map(row => ({
      id: String(row.id),
      slug: String(row.slug),
      titulo: String(row.titulo),
      descripcion: String(row.descripcion ?? ''),
      imagenUrl: typeof row.imagenUrl === 'string' ? row.imagenUrl : null,
      estado: String(row.estado),
      cursos: Array.isArray(row.cursos) ? (row.cursos as CursoEnCarrera[]) : [],
    }))
  }

  async publicarContenidoLeccion(leccionId: string, contenido: string): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(contenido))
    const digest = [...new Uint8Array(hash)]
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('')
    const key = `catalog/lecciones/${leccionId}/${digest}.json`
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.contentBucket,
        Key: key,
        Body: contenido,
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256',
      }),
    )
    return key
  }
}

/** Adaptadores tipados para reutilizar una tabla sin mezclar contratos de dominio. */
export class DynamoCursoRepository implements CursoRepository {
  constructor(private readonly store: DynamoCatalogStore) {}
  porId(id: UniqueId): Promise<Curso | null> {
    return this.store.cursoPorIdAggregate(id)
  }
  porSlug(slug: string): Promise<Curso | null> {
    return this.store.porSlug(slug)
  }
  guardar(curso: Curso): Promise<void> {
    return this.store.guardarCurso(curso)
  }
  reemplazarBloques(id: UniqueId, bloques: Bloque[]): Promise<void> {
    return this.store.reemplazarBloques(id, bloques)
  }
  bloquesDe(id: UniqueId): Promise<Bloque[]> {
    return this.store.bloquesDe(id)
  }
  reemplazarEjercicios(id: UniqueId, ejercicios: Ejercicio[]): Promise<void> {
    return this.store.reemplazarEjercicios(id, ejercicios)
  }
  ejerciciosDe(id: UniqueId): Promise<Ejercicio[]> {
    return this.store.ejerciciosDe(id)
  }
}

export class DynamoCarreraRepository implements CarreraRepository {
  constructor(private readonly store: DynamoCatalogStore) {}
  porId(id: UniqueId): Promise<Carrera | null> {
    return this.store.carreraPorId(id)
  }
  todas(): Promise<Carrera[]> {
    return this.store.todas()
  }
  guardar(carrera: Carrera): Promise<void> {
    return this.store.guardarCarrera(carrera)
  }
}

export class DynamoBancoRepository implements BancoRepository {
  constructor(private readonly store: DynamoCatalogStore) {}
  porId(id: UniqueId): Promise<BancoPreguntas | null> {
    return this.store.bancoPorId(id)
  }
  porUso(uso: UsoBanco, tomoId?: string): Promise<BancoPreguntas | null> {
    return this.store.bancoPorUso(uso, tomoId)
  }
  guardar(banco: BancoPreguntas): Promise<void> {
    return this.store.guardarBanco(banco)
  }
}
