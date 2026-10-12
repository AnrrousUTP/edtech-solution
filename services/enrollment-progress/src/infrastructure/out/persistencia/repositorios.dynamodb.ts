import {
  DynamoRepository,
  assertDynamoItemSize,
  type DomainEvent,
  UniqueId,
  crearDynamoDocumentClient,
} from '@edtech/shared-kernel'
import { GetCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import {
  IntentoEvaluacion,
  type TipoEvaluacion,
} from '../../../domain/entities/intento-evaluacion.entity'
import { Matricula } from '../../../domain/entities/matricula.entity'
import type { IntentoRepository } from '../../../domain/ports-out/intento.repository'
import type { MatriculaRepository } from '../../../domain/ports-out/matricula.repository'
import type {
  CursoProyeccionRepository,
  FuenteEventoProyeccion,
  ProyeccionEntrada,
} from '../../../domain/ports-out/curso-proyeccion.repository'
import {
  CursoProyectado,
  type TomoProyectado,
} from '../../../domain/value-objects/curso-proyectado.vo'

type Item = Record<string, unknown> & { PK: string; SK: string }
type Cursor = Record<string, unknown>
type FuenteEstructura = {
  tomoId: string
  orden: number
  titulo: string
  umbral: number
  lecciones: { id: string; orden?: number }[]
}
const perfilMatricula = (id: string) => ({ PK: `MATRICULA#${id}`, SK: 'PROFILE' })
const matriculaUsuarioCurso = (usuarioId: string, cursoId: string) => ({
  PK: `USER#${usuarioId}`,
  SK: `COURSE#${cursoId}`,
})
const intentoPerfil = (id: string) => ({ PK: `INTENTO#${id}`, SK: 'PROFILE' })
const parseFecha = (value: unknown): Date | null =>
  typeof value === 'string' && value ? new Date(value) : null
const string = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback
const number = (value: unknown, fallback = 0): number =>
  typeof value === 'number' ? value : fallback

const outboxWrites = (events: DomainEvent[]): Item[] =>
  events.map(event => {
    const occurredAt = event.occurredAt.toISOString()
    return {
      PK: `OUTBOX#${event.eventId}`,
      SK: 'EVENT',
      entity: 'Outbox',
      eventId: event.eventId,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      occurredAt,
      payload: event.payload(),
      createdAt: new Date().toISOString(),
      expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      GSI1PK: 'OUTBOX#PENDING',
      GSI1SK: `${occurredAt}#${event.eventId}`,
    }
  })

const eventoWrites = (tableName: string, events: DomainEvent[]) =>
  outboxWrites(events).map(item => ({
    Put: {
      TableName: tableName,
      Item: item,
      ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    },
  }))

/** Persistence DynamoDB de matrícula, intento y proyección de catálogo.
 * Cada agregado y sus eventos outbox se confirman en una transacción; el
 * progreso detallado se guarda en items separados para respetar el límite de
 * 400 KB de DynamoDB.
 */
export class DynamoEnrollmentStore {
  private readonly repository: DynamoRepository

  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {
    if (!tableName.trim()) throw new Error('Falta el nombre de la tabla de matrícula/progreso')
    this.repository = new DynamoRepository(client, tableName)
  }

  static desdeConfig(tableName: string, options: { region?: string; endpoint?: string } = {}) {
    return new DynamoEnrollmentStore(crearDynamoDocumentClient(options), tableName)
  }

  private async get(key: { PK: string; SK: string }, consistentRead = true): Promise<Item | null> {
    const result = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: key, ConsistentRead: consistentRead }),
    )
    return (result.Item as Item | undefined) ?? null
  }

  private async queryAll(input: {
    partition: string
    prefix?: string
    index?: 'GSI1' | 'GSI2'
    descending?: boolean
  }): Promise<Item[]> {
    const rows: Item[] = []
    let cursor: Cursor | undefined
    do {
      const index = input.index
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          ...(index ? { IndexName: index } : {}),
          KeyConditionExpression: input.prefix
            ? `${index ? `${index}PK` : 'PK'} = :pk AND begins_with(${index ? `${index}SK` : 'SK'}, :prefix)`
            : `${index ? `${index}PK` : 'PK'} = :pk`,
          ExpressionAttributeValues: {
            ':pk': input.partition,
            ...(input.prefix ? { ':prefix': input.prefix } : {}),
          },
          ScanIndexForward: !(input.descending ?? true),
          Limit: 100,
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      )
      rows.push(...((result.Items ?? []) as Item[]))
      cursor = result.LastEvaluatedKey as Cursor | undefined
    } while (cursor)
    return rows
  }

  private matriculaDesde(item: Item, progreso: Item[]): Matricula {
    const lecciones = new Map<string, string>()
    const tomos = new Set<string>()
    for (const row of progreso) {
      if (row.entity === 'LessonProgress') lecciones.set(string(row.leccionId), string(row.tomoId))
      if (row.entity === 'TomoProgress') tomos.add(string(row.tomoId))
    }
    return Matricula.reconstruir({
      id: UniqueId.desde(string(item.id)),
      usuarioId: UniqueId.desde(string(item.usuarioId)),
      cursoId: UniqueId.desde(string(item.cursoId)),
      estado: string(item.estado, 'ACTIVA'),
      origen: string(item.origen, 'PAGO'),
      ordenId: typeof item.ordenId === 'string' ? UniqueId.desde(item.ordenId) : null,
      accesoHasta: parseFecha(item.accesoHasta),
      cursoCompletado: Boolean(item.cursoCompletadoAt),
      leccionesCompletadas: lecciones,
      tomosCompletados: tomos,
    } as never)
  }

  private async cargarMatricula(item: Item | null): Promise<Matricula | null> {
    if (!item) return null
    const progreso = await this.queryAll({
      partition: `MATRICULA#${string(item.id)}`,
      prefix: 'PROGRESS#',
    })
    return this.matriculaDesde(item, progreso)
  }

  async matriculaPorId(id: UniqueId): Promise<Matricula | null> {
    return this.cargarMatricula(await this.get(perfilMatricula(id.valor)))
  }

  async porUsuarioYCurso(usuarioId: UniqueId, cursoId: UniqueId): Promise<Matricula | null> {
    const lookup = await this.get(matriculaUsuarioCurso(usuarioId.valor, cursoId.valor))
    return lookup && typeof lookup.matriculaId === 'string'
      ? this.matriculaPorId(UniqueId.desde(lookup.matriculaId))
      : null
  }

  async porUsuario(usuarioId: UniqueId): Promise<Matricula[]> {
    const profiles = await this.queryAll({
      partition: `USER#${usuarioId.valor}`,
      index: 'GSI1',
      prefix: 'MATRICULA#',
    })
    const rows: Matricula[] = []
    for (const profile of profiles) {
      const matricula = await this.cargarMatricula(profile)
      if (matricula) rows.push(matricula)
    }
    return rows
  }

  private async construirEscriturasMatricula(matricula: Matricula) {
    const key = perfilMatricula(matricula.id.valor)
    const actual = await this.get(key)
    const previo = actual ? await this.queryAll({ partition: key.PK, prefix: 'PROGRESS#' }) : []
    const anterior = new Set(previo.map(item => item.SK))
    const ahora = new Date().toISOString()
    const version = number(actual?.version)
    const item: Item = {
      ...key,
      entity: 'Matricula',
      id: matricula.id.valor,
      usuarioId: matricula.usuarioId.valor,
      cursoId: matricula.cursoId.valor,
      estado: matricula.estado,
      origen: matricula.origen,
      ordenId: matricula.ordenId?.valor ?? null,
      accesoHasta: matricula.accesoHasta?.toISOString() ?? null,
      version: version + 1,
      createdAt: string(actual?.createdAt, ahora),
      updatedAt: ahora,
      ...(matricula.cursoCompletado
        ? { cursoCompletadoAt: string(actual?.cursoCompletadoAt, ahora) }
        : actual?.cursoCompletadoAt
          ? { cursoCompletadoAt: actual.cursoCompletadoAt }
          : {}),
      GSI1PK: `USER#${matricula.usuarioId.valor}`,
      GSI1SK: `MATRICULA#${string(actual?.createdAt, ahora)}#${matricula.id.valor}`,
      GSI2PK: `COURSE#${matricula.cursoId.valor}`,
      GSI2SK: `USER#${matricula.usuarioId.valor}#${matricula.id.valor}`,
    }
    assertDynamoItemSize(item)
    const operations: NonNullable<
      import('@aws-sdk/lib-dynamodb').TransactWriteCommandInput['TransactItems']
    > = [
      {
        Put: {
          TableName: this.tableName,
          Item: item,
          ConditionExpression: actual ? 'version = :version' : 'attribute_not_exists(PK)',
          ...(actual ? { ExpressionAttributeValues: { ':version': version } } : {}),
        },
      },
    ]
    if (!actual)
      operations.push({
        Put: {
          TableName: this.tableName,
          Item: {
            ...matriculaUsuarioCurso(matricula.usuarioId.valor, matricula.cursoId.valor),
            entity: 'EnrollmentLookup',
            matriculaId: matricula.id.valor,
            createdAt: ahora,
          },
          ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        },
      })
    for (const [leccionId, tomoId] of matricula.leccionesCompletadas) {
      const sk = `PROGRESS#LESSON#${leccionId}`
      if (anterior.has(sk)) continue
      operations.push({
        Put: {
          TableName: this.tableName,
          Item: {
            PK: key.PK,
            SK: sk,
            entity: 'LessonProgress',
            matriculaId: matricula.id.valor,
            usuarioId: matricula.usuarioId.valor,
            cursoId: matricula.cursoId.valor,
            leccionId,
            tomoId,
            completedAt: ahora,
          },
        },
      })
    }
    for (const tomoId of matricula.tomosCompletados) {
      const sk = `PROGRESS#TOMO#${tomoId}`
      if (anterior.has(sk)) continue
      operations.push({
        Put: {
          TableName: this.tableName,
          Item: {
            PK: key.PK,
            SK: sk,
            entity: 'TomoProgress',
            matriculaId: matricula.id.valor,
            usuarioId: matricula.usuarioId.valor,
            cursoId: matricula.cursoId.valor,
            tomoId,
            completedAt: ahora,
          },
        },
      })
    }
    const events = matricula.pullEvents()
    operations.push(...eventoWrites(this.tableName, events))
    return operations
  }

  async guardarMatricula(matricula: Matricula): Promise<void> {
    await this.repository.transact(await this.construirEscriturasMatricula(matricula))
  }

  async evaluacionAprobada(
    usuarioId: UniqueId,
    tomoId: string,
  ): Promise<{ aprobada: boolean; puntaje: number }> {
    const rows = await this.queryAll({
      partition: `USER#${usuarioId.valor}#TOMO#${tomoId}`,
      prefix: 'EVALUATION#',
    })
    const aprobadas = rows.filter(row => row.aprobado === true)
    return {
      aprobada: aprobadas.length > 0,
      puntaje: Math.max(0, ...aprobadas.map(row => number(row.puntaje))),
    }
  }

  async cursosCompletadosDe(usuarioId: UniqueId): Promise<string[]> {
    const completed: string[] = []
    for (const matricula of await this.porUsuario(usuarioId)) {
      if (await this.cursoYaCompletado(matricula.id)) completed.push(matricula.cursoId.valor)
    }
    return completed
  }

  async cursoYaCompletado(matriculaId: UniqueId): Promise<boolean> {
    return Boolean((await this.get(perfilMatricula(matriculaId.valor)))?.cursoCompletadoAt)
  }

  private intentoDesde(item: Item, respuestas: Item[]): IntentoEvaluacion {
    return IntentoEvaluacion.reconstruir({
      id: UniqueId.desde(string(item.id)),
      usuarioId: UniqueId.desde(string(item.usuarioId)),
      tipo: string(item.tipo) as TipoEvaluacion,
      bancoId: UniqueId.desde(string(item.bancoId)),
      matriculaId: typeof item.matriculaId === 'string' ? UniqueId.desde(item.matriculaId) : null,
      tomoId: typeof item.tomoId === 'string' ? item.tomoId : null,
      estado: string(item.estado, 'EN_CURSO'),
      puntaje: item.puntaje === null || item.puntaje === undefined ? null : number(item.puntaje),
      aprobado: typeof item.aprobado === 'boolean' ? item.aprobado : null,
      nivelResultante: typeof item.nivelResultante === 'string' ? item.nivelResultante : null,
      iniciadoAt: parseFecha(item.iniciadoAt) ?? new Date(0),
      entregadoAt: parseFecha(item.entregadoAt),
      respuestas: respuestas.map(response => ({
        preguntaId: string(response.preguntaId),
        respuesta: response.respuesta,
        correcta: typeof response.correcta === 'boolean' ? response.correcta : null,
      })),
    } as never)
  }

  private async cargarIntento(item: Item | null): Promise<IntentoEvaluacion | null> {
    if (!item) return null
    const respuestas = await this.queryAll({
      partition: `INTENTO#${string(item.id)}`,
      prefix: 'RESPONSE#',
    })
    return this.intentoDesde(item, respuestas)
  }

  async intentoPorId(id: UniqueId): Promise<IntentoEvaluacion | null> {
    return this.cargarIntento(await this.get(intentoPerfil(id.valor)))
  }

  async guardarIntento(intento: IntentoEvaluacion, progreso?: Matricula): Promise<void> {
    if (progreso && progreso.id.valor !== intento.matriculaId?.valor)
      throw new Error('La matrícula no coincide con el intento que se entrega')
    const key = intentoPerfil(intento.id.valor)
    const actual = await this.get(key)
    const mat = intento.matriculaId
      ? await this.get(perfilMatricula(intento.matriculaId.valor))
      : null
    const courseId = typeof mat?.cursoId === 'string' ? mat.cursoId : null
    const startedAt = intento.iniciadoAt.toISOString()
    const deliveredAt = intento.entregadoAt?.toISOString() ?? null
    const index =
      intento.tipo === 'NIVELACION'
        ? {
            GSI1PK: `USER#${intento.usuarioId.valor}#NIVELACION`,
            GSI1SK: `STARTED#${startedAt}#${intento.id.valor}`,
          }
        : intento.tipo === 'EVALUACION_INICIAL' && courseId && deliveredAt
          ? {
              GSI1PK: `USER#${intento.usuarioId.valor}#COURSE#${courseId}#INITIAL`,
              GSI1SK: `DELIVERED#${deliveredAt}#${intento.id.valor}`,
            }
          : intento.tipo === 'EVALUACION_INICIAL' && courseId
            ? {
                GSI1PK: `USER#${intento.usuarioId.valor}#COURSE#${courseId}#INITIAL#OPEN`,
                GSI1SK: `STARTED#${startedAt}#${intento.id.valor}`,
              }
            : {
                GSI1PK: `USER#${intento.usuarioId.valor}#ATTEMPTS`,
                GSI1SK: `STARTED#${startedAt}#${intento.id.valor}`,
              }
    const item: Item = {
      ...key,
      entity: 'AssessmentAttempt',
      id: intento.id.valor,
      usuarioId: intento.usuarioId.valor,
      tipo: intento.tipo,
      bancoId: intento.bancoId.valor,
      matriculaId: intento.matriculaId?.valor ?? null,
      cursoId: courseId,
      tomoId: intento.tomoId,
      estado: intento.estado,
      puntaje: intento.puntaje,
      aprobado: intento.aprobado,
      nivelResultante: intento.nivel,
      iniciadoAt: startedAt,
      entregadoAt: deliveredAt,
      updatedAt: new Date().toISOString(),
      version: number(actual?.version) + 1,
      ...index,
    }
    assertDynamoItemSize(item)
    const operations: NonNullable<
      import('@aws-sdk/lib-dynamodb').TransactWriteCommandInput['TransactItems']
    > = [
      {
        Put: {
          TableName: this.tableName,
          Item: item,
          ...(actual
            ? {
                ConditionExpression: 'version = :version',
                ExpressionAttributeValues: { ':version': number(actual.version) },
              }
            : { ConditionExpression: 'attribute_not_exists(PK)' }),
        },
      },
    ]
    const respuestasPorId = new Map(
      intento.respuestas.map(response => [response.preguntaId, response]),
    )
    if (respuestasPorId.size !== intento.respuestas.length)
      throw new Error('La entrega contiene preguntas duplicadas')
    for (const response of respuestasPorId.values())
      operations.push({
        Put: {
          TableName: this.tableName,
          Item: {
            PK: key.PK,
            SK: `RESPONSE#${response.preguntaId}`,
            entity: 'AssessmentResponse',
            preguntaId: response.preguntaId,
            respuesta: response.respuesta,
            correcta: response.correcta,
          },
        },
      })
    if (intento.estado === 'ENTREGADO' && intento.aprobado !== null && intento.tomoId)
      operations.push({
        Put: {
          TableName: this.tableName,
          Item: {
            PK: `USER#${intento.usuarioId.valor}#TOMO#${intento.tomoId}`,
            SK: `EVALUATION#${deliveredAt}#${intento.id.valor}`,
            entity: 'TomoEvaluation',
            intentoId: intento.id.valor,
            usuarioId: intento.usuarioId.valor,
            tomoId: intento.tomoId,
            puntaje: intento.puntaje ?? 0,
            aprobado: intento.aprobado,
          },
        },
      })
    operations.push(...eventoWrites(this.tableName, intento.pullEvents()))
    if (progreso) operations.push(...(await this.construirEscriturasMatricula(progreso)))
    if (operations.length > 100)
      throw new Error('La entrega supera el límite de 100 escrituras DynamoDB')
    await this.repository.transact(operations)
  }

  async ultimoNivelacionDe(usuarioId: UniqueId): Promise<IntentoEvaluacion | null> {
    const rows = await this.queryAll({
      partition: `USER#${usuarioId.valor}#NIVELACION`,
      index: 'GSI1',
      prefix: 'STARTED#',
      descending: true,
    })
    return this.cargarIntento(rows[0] ?? null)
  }

  async ultimoEvaluacionInicialDe(
    usuarioId: UniqueId,
    cursoId: UniqueId,
  ): Promise<IntentoEvaluacion | null> {
    const rows = await this.queryAll({
      partition: `USER#${usuarioId.valor}#COURSE#${cursoId.valor}#INITIAL`,
      index: 'GSI1',
      prefix: 'DELIVERED#',
      descending: true,
    })
    return this.cargarIntento(rows[0] ?? null)
  }

  private cursoDesde(item: Item | null): CursoProyectado | null {
    if (!item) return null
    const estructura = Array.isArray(item.estructura) ? (item.estructura as FuenteEstructura[]) : []
    const tomos: TomoProyectado[] = estructura.map(tomo => ({
      id: tomo.tomoId,
      orden: tomo.orden,
      titulo: tomo.titulo,
      umbral: tomo.umbral,
      leccionIds: tomo.lecciones.map(leccion => leccion.id),
    }))
    return new CursoProyectado(
      string(item.cursoId),
      string(item.titulo),
      string(item.slug),
      Boolean(item.publicado),
      number(item.precio),
      typeof item.nivelMax === 'string' ? item.nivelMax : null,
      tomos,
    )
  }

  async cursoPorId(cursoId: string): Promise<CursoProyectado | null> {
    return this.cursoDesde(await this.get({ PK: `COURSE#${cursoId}`, SK: 'PROJECTION' }))
  }

  private fuenteMarcador(fuente: FuenteEventoProyeccion) {
    return {
      PK: `EVENT#${fuente.eventId}`,
      SK: 'PROCESSED',
      entity: 'ProcessedCatalogEvent',
      eventId: fuente.eventId,
      eventType: fuente.eventType,
      occurredAt: fuente.occurredAt,
      processedAt: new Date().toISOString(),
      expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    }
  }

  private async fuenteYaProcesada(fuente: FuenteEventoProyeccion): Promise<boolean> {
    return (await this.get({ PK: `EVENT#${fuente.eventId}`, SK: 'PROCESSED' })) !== null
  }

  private async guardarProyeccion(
    key: { PK: string; SK: string },
    item: Item,
    actual: Item | null,
    fuente?: FuenteEventoProyeccion,
  ): Promise<void> {
    if (fuente && (await this.fuenteYaProcesada(fuente))) return
    const operations: NonNullable<
      import('@aws-sdk/lib-dynamodb').TransactWriteCommandInput['TransactItems']
    > = []
    const eventoEsAnterior = Boolean(
      fuente &&
      actual?.updatedAt &&
      Date.parse(fuente.occurredAt) < Date.parse(String(actual.updatedAt)),
    )
    if (!eventoEsAnterior) {
      assertDynamoItemSize(item)
      operations.push({
        Put: {
          TableName: this.tableName,
          Item: item,
          ...(actual
            ? {
                ConditionExpression: 'version = :version',
                ExpressionAttributeValues: { ':version': number(actual.version) },
              }
            : { ConditionExpression: 'attribute_not_exists(PK)' }),
        },
      })
    }
    if (fuente)
      operations.push({
        Put: {
          TableName: this.tableName,
          Item: this.fuenteMarcador(fuente),
          ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        },
      })
    if (operations.length) await this.repository.transact(operations)
  }

  async guardar(entrada: ProyeccionEntrada, fuente?: FuenteEventoProyeccion): Promise<void> {
    const key = { PK: `COURSE#${entrada.cursoId}`, SK: 'PROJECTION' }
    const actual = await this.get(key)
    const estructura = entrada.estructura as FuenteEstructura[]
    const item: Item = {
      ...key,
      entity: 'CourseProjection',
      cursoId: entrada.cursoId,
      titulo: entrada.titulo,
      slug: entrada.slug,
      publicado: entrada.publicado,
      precio: entrada.precio,
      nivelMax: entrada.nivelMax,
      estructura,
      version: number(actual?.version) + 1,
      updatedAt: fuente?.occurredAt ?? new Date().toISOString(),
      createdAt: string(actual?.createdAt, new Date().toISOString()),
    }
    await this.guardarProyeccion(key, item, actual, fuente)
  }

  async marcarPublicado(
    cursoId: string,
    publicado: boolean,
    fuente?: FuenteEventoProyeccion,
  ): Promise<void> {
    const key = { PK: `COURSE#${cursoId}`, SK: 'PROJECTION' }
    const actual = await this.get(key)
    if (!actual) {
      if (fuente && !(await this.fuenteYaProcesada(fuente)))
        await this.repository.transact([
          {
            Put: {
              TableName: this.tableName,
              Item: this.fuenteMarcador(fuente),
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ])
      return
    }
    const item: Item = {
      ...actual,
      publicado,
      version: number(actual.version) + 1,
      updatedAt: fuente?.occurredAt ?? new Date().toISOString(),
    }
    await this.guardarProyeccion(key, item, actual, fuente)
  }

  async actualizarTomo(
    cursoId: string,
    tomoId: string,
    lecciones: { id: string; titulo: string }[],
    fuente?: FuenteEventoProyeccion,
  ): Promise<void> {
    const key = { PK: `COURSE#${cursoId}`, SK: 'PROJECTION' }
    const actual = await this.get(key)
    if (!actual) {
      if (fuente && !(await this.fuenteYaProcesada(fuente)))
        await this.repository.transact([
          {
            Put: {
              TableName: this.tableName,
              Item: this.fuenteMarcador(fuente),
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ])
      return
    }
    const estructura = (
      Array.isArray(actual.estructura) ? actual.estructura : []
    ) as FuenteEstructura[]
    const next = estructura.map(tomo =>
      tomo.tomoId === tomoId
        ? {
            ...tomo,
            lecciones: lecciones.map((leccion, index) => ({ ...leccion, orden: index + 1 })),
          }
        : tomo,
    )
    await this.guardarProyeccion(
      key,
      {
        ...actual,
        estructura: next,
        version: number(actual.version) + 1,
        updatedAt: fuente?.occurredAt ?? new Date().toISOString(),
      },
      actual,
      fuente,
    )
  }
}

export class DynamoMatriculaRepository implements MatriculaRepository {
  constructor(private readonly store: DynamoEnrollmentStore) {}
  porId(id: UniqueId) {
    return this.store.matriculaPorId(id)
  }
  porUsuarioYCurso(usuarioId: UniqueId, cursoId: UniqueId) {
    return this.store.porUsuarioYCurso(usuarioId, cursoId)
  }
  porUsuario(usuarioId: UniqueId) {
    return this.store.porUsuario(usuarioId)
  }
  guardar(matricula: Matricula) {
    return this.store.guardarMatricula(matricula)
  }
  evaluacionAprobada(usuarioId: UniqueId, tomoId: string) {
    return this.store.evaluacionAprobada(usuarioId, tomoId)
  }
  cursosCompletadosDe(usuarioId: UniqueId) {
    return this.store.cursosCompletadosDe(usuarioId)
  }
  cursoYaCompletado(matriculaId: UniqueId) {
    return this.store.cursoYaCompletado(matriculaId)
  }
}

export class DynamoIntentoRepository implements IntentoRepository {
  constructor(private readonly store: DynamoEnrollmentStore) {}
  porId(id: UniqueId) {
    return this.store.intentoPorId(id)
  }
  guardar(intento: IntentoEvaluacion) {
    return this.store.guardarIntento(intento)
  }
  guardarEntregaConProgreso(intento: IntentoEvaluacion, matricula: Matricula) {
    return this.store.guardarIntento(intento, matricula)
  }
  ultimoNivelacionDe(usuarioId: UniqueId) {
    return this.store.ultimoNivelacionDe(usuarioId)
  }
  ultimoEvaluacionInicialDe(usuarioId: UniqueId, cursoId: UniqueId) {
    return this.store.ultimoEvaluacionInicialDe(usuarioId, cursoId)
  }
}

export class DynamoCursoProyeccionRepository implements CursoProyeccionRepository {
  constructor(private readonly store: DynamoEnrollmentStore) {}
  porId(cursoId: string) {
    return this.store.cursoPorId(cursoId)
  }
  guardar(entrada: ProyeccionEntrada, fuente?: FuenteEventoProyeccion) {
    return this.store.guardar(entrada, fuente)
  }
  marcarPublicado(cursoId: string, publicado: boolean, fuente?: FuenteEventoProyeccion) {
    return this.store.marcarPublicado(cursoId, publicado, fuente)
  }
  actualizarTomo(
    cursoId: string,
    tomoId: string,
    lecciones: { id: string; titulo: string }[],
    fuente?: FuenteEventoProyeccion,
  ) {
    return this.store.actualizarTomo(cursoId, tomoId, lecciones, fuente)
  }
}
