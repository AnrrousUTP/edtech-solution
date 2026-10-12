import { randomUUID } from 'node:crypto'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type { SobreEvento } from '@edtech/shared-kernel'
import type { Afiliado, Atribucion, VentaReferida } from '../../../domain/entities/afiliado.entity'
import { AfiliacionError } from '../../../domain/module.errors'
import type { AfiliadosRepository } from '../../../domain/ports-out/afiliados.repository'
import { calcularComision, ingresoNeto } from '../../../domain/value-objects/comision.vo'

type Item = Record<string, unknown> & { PK: string; SK: string }
type Cursor = Record<string, unknown>
const nowIso = (): string => new Date().toISOString()
const epoch = (value: string): number => Math.floor(Date.parse(value) / 1000)
const affiliatePk = (id: string): string => `AFFILIATE#${id}`
const buyerPk = (id: string): string => `BUYER#${id}`
const notificationSk = (date: string, id: string): string => `NOTIFICATION#${date}#${id}`
const afiliadoDe = (item: Item): Afiliado => ({
  id: String(item.id),
  usuarioId: String(item.usuarioId),
  refId: String(item.refId),
  activo: Boolean(item.activo),
  cursoSlug: typeof item.cursoSlug === 'string' ? item.cursoSlug : null,
  creadoAt: String(item.creadoAt),
})
const conditionalFailure = (error: unknown): boolean =>
  (error as { name?: string })?.name === 'ConditionalCheckFailedException' ||
  (error as { name?: string })?.name === 'TransactionCanceledException'

/** Repositorio del flujo de afiliados en una tabla DynamoDB dedicada.
 * Los registros de comisión, notificación, evento procesado y outbox se escriben
 * en transacciones para que una repetición del mensaje no duplique ingresos.
 */
export class DynamoAfiliadosRepository implements AfiliadosRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly pageSize = 100,
  ) {
    if (!tableName.trim()) throw new Error('Falta el nombre de la tabla de afiliados')
  }

  private async get(pk: string, sk: string, consistentRead = true): Promise<Item | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: pk, SK: sk },
        ConsistentRead: consistentRead,
      }),
    )
    return (result.Item as Item | undefined) ?? null
  }

  private async queryAll(input: {
    partition: string
    prefix?: string
    index?: 'GSI1' | 'GSI2'
    filter?: string
    names?: Record<string, string>
    values?: Record<string, unknown>
    forward?: boolean
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
            ? `${index ? 'GSI1PK' : 'PK'} = :pk AND begins_with(${index ? 'GSI1SK' : 'SK'}, :prefix)`
            : `${index ? 'GSI1PK' : 'PK'} = :pk`,
          ExpressionAttributeValues: {
            ':pk': input.partition,
            ...(input.prefix ? { ':prefix': input.prefix } : {}),
            ...(input.values ?? {}),
          },
          ...(input.filter ? { FilterExpression: input.filter } : {}),
          ...(input.names ? { ExpressionAttributeNames: input.names } : {}),
          ScanIndexForward: input.forward ?? false,
          Limit: this.pageSize,
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      )
      rows.push(...((result.Items ?? []) as Item[]))
      cursor = result.LastEvaluatedKey as Cursor | undefined
    } while (cursor)
    return rows
  }

  private outbox(eventType: string, aggregateId: string, payload: Record<string, unknown>): Item {
    const occurredAt = nowIso()
    const eventId = randomUUID()
    return {
      PK: `OUTBOX#${eventId}`,
      SK: 'EVENT',
      entity: 'Outbox',
      eventId,
      eventType,
      aggregateId,
      occurredAt,
      payload,
      createdAt: occurredAt,
      expiresAt: epoch(occurredAt) + 30 * 24 * 60 * 60,
      GSI1PK: 'OUTBOX#PENDING',
      GSI1SK: `${occurredAt}#${eventId}`,
    }
  }

  async activar(usuarioId: string): Promise<Afiliado> {
    const existing = await this.get(`USER#${usuarioId}`, 'AFFILIATE')
    if (existing) {
      const profile = await this.get(affiliatePk(String(existing.afiliadoId)), 'PROFILE')
      if (profile) return afiliadoDe(profile)
    }
    const createdAt = nowIso()
    const affiliate: Afiliado = {
      id: randomUUID(),
      usuarioId,
      refId: randomUUID(),
      activo: true,
      cursoSlug: null,
      creadoAt: createdAt,
    }
    const profile: Item = {
      PK: affiliatePk(affiliate.id),
      SK: 'PROFILE',
      entity: 'Affiliate',
      ...affiliate,
      GSI1PK: 'AFFILIATES',
      GSI1SK: `${createdAt}#${affiliate.id}`,
      totalCentavos: 0,
      ventas: 0,
      visitas: 0,
      version: 1,
    }
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: profile,
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: {
                  PK: `USER#${usuarioId}`,
                  SK: 'AFFILIATE',
                  entity: 'AffiliateLookup',
                  afiliadoId: affiliate.id,
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: {
                  PK: `REF#${affiliate.refId}`,
                  SK: 'AFFILIATE',
                  entity: 'ReferralLookup',
                  afiliadoId: affiliate.id,
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: this.outbox('affiliates.afiliado-activado.v1', affiliate.id, {
                  afiliadoId: affiliate.id,
                  usuarioId,
                  refId: affiliate.refId,
                }),
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      )
      return affiliate
    } catch (error) {
      if (!conditionalFailure(error)) throw error
      const lookup = await this.get(`USER#${usuarioId}`, 'AFFILIATE')
      const concurrent =
        lookup && (await this.get(affiliatePk(String(lookup.afiliadoId)), 'PROFILE'))
      if (concurrent) return afiliadoDe(concurrent)
      throw error
    }
  }

  async porUsuario(usuarioId: string): Promise<Afiliado | null> {
    const lookup = await this.get(`USER#${usuarioId}`, 'AFFILIATE')
    if (!lookup) return null
    const profile = await this.get(affiliatePk(String(lookup.afiliadoId)), 'PROFILE')
    return profile ? afiliadoDe(profile) : null
  }

  async visitar(
    refId: string,
    visitaAnterior?: string,
  ): Promise<{ visitaId: string; destino: string }> {
    const ref = await this.get(`REF#${refId}`, 'AFFILIATE')
    const profile = ref && (await this.get(affiliatePk(String(ref.afiliadoId)), 'PROFILE'))
    if (!profile?.activo)
      throw new AfiliacionError('REFERIDO_INVALIDO', 'Este enlace no está activo', 404)
    const previous = visitaAnterior ? await this.get(`VISIT#${visitaAnterior}`, 'VISIT') : null
    const previousValid =
      previous &&
      previous.afiliadoId === profile.id &&
      !previous.usuarioId &&
      Number(previous.expiresAt) > epoch(nowIso())
    const visitaId = previousValid ? visitaAnterior! : randomUUID()
    if (!previousValid) {
      const createdAt = nowIso()
      const expiresAt = epoch(createdAt) + 30 * 60
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: {
                  PK: `VISIT#${visitaId}`,
                  SK: 'VISIT',
                  entity: 'ReferralVisit',
                  id: visitaId,
                  afiliadoId: profile.id,
                  creadoAt: createdAt,
                  expiresAt,
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: {
                  PK: affiliatePk(String(profile.id)),
                  SK: `VISITLOG#${createdAt}#${visitaId}`,
                  entity: 'ReferralVisitLog',
                  id: visitaId,
                  afiliadoId: profile.id,
                  creadoAt: createdAt,
                  GSI1PK: affiliatePk(String(profile.id)),
                  GSI1SK: `VISIT#${createdAt}#${visitaId}`,
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Update: {
                TableName: this.tableName,
                Key: { PK: affiliatePk(String(profile.id)), SK: 'PROFILE' },
                UpdateExpression: 'SET updatedAt = :now ADD visitas :one',
                ExpressionAttributeValues: { ':one': 1, ':now': createdAt },
              },
            },
          ],
        }),
      )
    }
    return {
      visitaId,
      destino: profile.cursoSlug
        ? `/cursos/${encodeURIComponent(String(profile.cursoSlug))}`
        : '/cursos',
    }
  }

  async atribuir(usuarioId: string, visitaId?: string): Promise<Atribucion | null> {
    if (visitaId) {
      const visit = await this.get(`VISIT#${visitaId}`, 'VISIT')
      if (
        visit &&
        Number(visit.expiresAt) > epoch(nowIso()) &&
        (!visit.usuarioId || visit.usuarioId === usuarioId)
      ) {
        const profile = await this.get(affiliatePk(String(visit.afiliadoId)), 'PROFILE')
        if (profile?.activo && profile.usuarioId !== usuarioId) {
          const current = await this.get(buyerPk(usuarioId), 'ATTRIBUTION')
          const createdAt = String(visit.creadoAt)
          if (!current || String(current.actualizadoAt) <= createdAt) {
            const attribution: Item = {
              PK: buyerPk(usuarioId),
              SK: 'ATTRIBUTION',
              entity: 'BuyerAttribution',
              afiliadoId: profile.id,
              afiliadoUsuarioId: profile.usuarioId,
              visitaId,
              refId: profile.refId,
              compradorId: usuarioId,
              politica: 'ultimo-referido-30d-v1',
              tasaBps: 500,
              actualizadoAt: createdAt,
              GSI1PK: affiliatePk(String(profile.id)),
              GSI1SK: `ATTRIBUTION#${createdAt}#${usuarioId}`,
            }
            try {
              await this.client.send(
                new TransactWriteCommand({
                  TransactItems: [
                    {
                      Update: {
                        TableName: this.tableName,
                        Key: { PK: `VISIT#${visitaId}`, SK: 'VISIT' },
                        UpdateExpression: 'SET usuarioId = :buyer',
                        ConditionExpression:
                          '(attribute_not_exists(usuarioId) OR usuarioId = :buyer) AND expiresAt > :now',
                        ExpressionAttributeValues: { ':buyer': usuarioId, ':now': epoch(nowIso()) },
                      },
                    },
                    {
                      Put: {
                        TableName: this.tableName,
                        Item: attribution,
                        ...(current
                          ? {
                              ConditionExpression: 'actualizadoAt <= :createdAt',
                              ExpressionAttributeValues: { ':createdAt': createdAt },
                            }
                          : { ConditionExpression: 'attribute_not_exists(PK)' }),
                      },
                    },
                  ],
                }),
              )
            } catch (error) {
              if (!conditionalFailure(error)) throw error
            }
          }
        }
      }
    }
    const current = await this.get(buyerPk(usuarioId), 'ATTRIBUTION')
    if (
      !current ||
      Number(current.actualizadoAt ? Date.parse(String(current.actualizadoAt)) : 0) <
        Date.now() - 30 * 24 * 60 * 60 * 1000
    )
      return null
    const profile = await this.get(affiliatePk(String(current.afiliadoId)), 'PROFILE')
    if (!profile?.activo || profile.usuarioId === usuarioId) return null
    return {
      afiliadoId: String(current.afiliadoId),
      afiliadoUsuarioId: String(current.afiliadoUsuarioId),
      visitaId: String(current.visitaId),
      refId: String(current.refId),
      compradorId: usuarioId,
      politica: 'ultimo-referido-30d-v1',
      tasaBps: 500,
    }
  }

  async configurar(usuarioId: string, cursoSlug: string | null): Promise<void> {
    if (cursoSlug) {
      const courses = await this.queryAll({
        partition: 'COURSE#PUBLISHED',
        prefix: `SLUG#${cursoSlug}`,
        index: 'GSI1',
        forward: true,
      })
      if (!courses.length)
        throw new AfiliacionError('CURSO_INVALIDO', 'Elige un curso publicado', 404)
    }
    const affiliate = await this.porUsuario(usuarioId)
    if (!affiliate?.activo)
      throw new AfiliacionError(
        'AFILIADO_INACTIVO',
        'Activa el programa antes de configurar tu enlace',
        409,
      )
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: affiliatePk(affiliate.id), SK: 'PROFILE' },
        UpdateExpression: 'SET cursoSlug = :slug, updatedAt = :now ADD version :one',
        ConditionExpression: 'activo = :true',
        ExpressionAttributeValues: {
          ':slug': cursoSlug,
          ':now': nowIso(),
          ':one': 1,
          ':true': true,
        },
      }),
    )
  }

  async resumen(
    usuarioId: string,
    desde?: string,
    hasta?: string,
    cursor?: string,
  ): Promise<Record<string, unknown>> {
    const affiliate = await this.porUsuario(usuarioId)
    if (!affiliate)
      throw new AfiliacionError('NO_AFILIADO', 'Activa tu participación para ver tus ingresos', 404)
    const all = await this.queryAll({ partition: affiliatePk(affiliate.id), index: 'GSI1' })
    const lower = desde ? `${desde}T00:00:00.000Z` : undefined
    const upper = hasta ? `${hasta}T23:59:59.999Z` : undefined
    const inRange = (item: Item) =>
      (!lower || String(item.creadoAt) >= lower) && (!upper || String(item.creadoAt) <= upper)
    const commissions = all.filter(item => item.entity === 'Commission' && inRange(item))
    const visits = all.filter(item => item.entity === 'ReferralVisitLog' && inRange(item))
    const courses = await this.queryAll({
      partition: 'COURSE#PUBLISHED',
      index: 'GSI1',
      forward: true,
    })
    const sorted = commissions.sort(
      (a, b) =>
        String(b.creadoAt).localeCompare(String(a.creadoAt)) ||
        String(b.id).localeCompare(String(a.id)),
    )
    const cursorIndex = cursor ? sorted.findIndex(row => row.id === cursor) : -1
    if (cursor && cursorIndex < 0)
      throw new AfiliacionError('CURSOR_INVALIDO', 'El cursor no corresponde a este historial')
    const start = cursor ? cursorIndex + 1 : 0
    const history = sorted.slice(Math.max(0, start), Math.max(0, start) + 50).map(row => ({
      id: String(row.id),
      ordenId: String(row.ordenId),
      cursoTitulo: String(row.cursoTitulo),
      baseCentavos: Number(row.baseCentavos),
      tasaBps: Number(row.tasaBps),
      originalCentavos: Number(row.originalCentavos),
      ingresoCentavos: Number(row.netoCentavos),
      estado:
        Number(row.netoCentavos) === 0
          ? 'ANULADA'
          : Number(row.netoCentavos) < Number(row.originalCentavos)
            ? 'AJUSTADA'
            : 'REGISTRADA',
      creadoAt: String(row.creadoAt),
    }))
    return {
      afiliado: affiliate,
      moneda: 'USD',
      totalCentavos: all
        .filter(item => item.entity === 'Commission')
        .reduce((sum, item) => sum + Number(item.netoCentavos), 0),
      ingresosPeriodoCentavos: commissions.reduce(
        (sum, item) => sum + Number(item.netoCentavos),
        0,
      ),
      ventas: commissions.length,
      visitas: visits.length,
      cursos: courses.map(row => ({ id: row.cursoId, titulo: row.titulo, slug: row.slug })),
      historial: history,
      siguienteCursor: sorted.length > start + 50 ? String(history.at(-1)?.id ?? '') : null,
    }
  }

  async notificaciones(usuarioId: string): Promise<Record<string, unknown>[]> {
    const rows = await this.queryAll({ partition: `USER#${usuarioId}`, prefix: 'NOTIFICATION#' })
    return rows.slice(0, 100).map(row => ({
      id: row.id,
      mensaje: row.mensaje,
      leida: Boolean(row.leida),
      creadoAt: row.creadoAt,
    }))
  }

  async leerNotificacion(usuarioId: string, id: string): Promise<boolean> {
    const rows = await this.queryAll({ partition: `USER#${usuarioId}`, prefix: 'NOTIFICATION#' })
    const row = rows.find(item => item.id === id)
    if (!row) return false
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: row.PK, SK: row.SK },
          UpdateExpression: 'SET leida = :yes',
          ExpressionAttributeValues: { ':yes': true },
        }),
      )
      return true
    } catch (error) {
      if (conditionalFailure(error)) return false
      throw error
    }
  }

  async admin(): Promise<Record<string, unknown>> {
    const affiliates = await this.queryAll({ partition: 'AFFILIATES', index: 'GSI1' })
    const commissions = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: { ':pk': 'COMMISSIONS' },
        ScanIndexForward: false,
        Limit: 100,
      }),
    )
    return {
      afiliados: affiliates
        .filter(item => item.entity === 'Affiliate')
        .map(item => ({
          ...afiliadoDe(item),
          ingresosCentavos: Number(item.totalCentavos ?? 0),
          ventas: Number(item.ventas ?? 0),
        })),
      comisiones: commissions.Items ?? [],
    }
  }

  async estadoAfiliado(id: string, activo: boolean): Promise<void> {
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: affiliatePk(id), SK: 'PROFILE' },
          UpdateExpression: 'SET activo = :active, updatedAt = :now ADD version :one',
          ConditionExpression: 'attribute_exists(PK)',
          ExpressionAttributeValues: { ':active': activo, ':now': nowIso(), ':one': 1 },
        }),
      )
    } catch (error) {
      if (conditionalFailure(error))
        throw new AfiliacionError('NO_AFILIADO', 'No existe el afiliado', 404)
      throw error
    }
  }

  private async eventAlreadyProcessed(eventId: string): Promise<boolean> {
    return Boolean(await this.get(`EVENT#${eventId}`, 'PROCESSED'))
  }

  async procesar(envelope: SobreEvento): Promise<void> {
    if (await this.eventAlreadyProcessed(envelope.eventId)) return
    const eventTime = nowIso()
    const processed: Item = {
      PK: `EVENT#${envelope.eventId}`,
      SK: 'PROCESSED',
      entity: 'ProcessedEvent',
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      expiresAt: epoch(eventTime) + 45 * 24 * 60 * 60,
    }
    const payload = envelope.payload as Record<string, unknown>
    let actions: NonNullable<
      ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']
    > = [
      {
        Put: {
          TableName: this.tableName,
          Item: processed,
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ]
    if (
      envelope.eventType === 'catalog.curso-publicado.v1' ||
      envelope.eventType === 'catalog.curso-despublicado.v1'
    ) {
      const published = envelope.eventType === 'catalog.curso-publicado.v1'
      const course: Item = {
        PK: `COURSE#${String(payload.cursoId)}`,
        SK: 'PROJECTION',
        entity: 'CourseProjection',
        cursoId: String(payload.cursoId),
        titulo: String(payload.titulo ?? ''),
        slug: String(payload.slug ?? ''),
        publicado: published,
        ...(published
          ? {
              GSI1PK: 'COURSE#PUBLISHED',
              GSI1SK: `SLUG#${String(payload.slug)}#${String(payload.cursoId)}`,
            }
          : {}),
      }
      actions.push({ Put: { TableName: this.tableName, Item: course } })
    } else if (envelope.eventType === 'payments.venta-referida-confirmada.v1') {
      const sale = payload as unknown as VentaReferida
      const profile = await this.get(affiliatePk(sale.afiliadoId), 'PROFILE')
      if (
        !profile ||
        profile.usuarioId !== sale.afiliadoUsuarioId ||
        sale.compradorId === sale.afiliadoUsuarioId
      )
        throw new Error('Venta referida sin afiliado válido')
      const existingOrder = await this.get(`ORDER#${sale.ordenId}`, 'COMMISSION')
      if (existingOrder) {
        await this.client.send(
          new PutCommand({
            TableName: this.tableName,
            Item: processed,
            ConditionExpression: 'attribute_not_exists(PK)',
          }),
        )
        return
      }
      const amount = calcularComision(sale.baseCentavos, sale.tasaBps)
      const id = randomUUID()
      const row: Item = {
        PK: affiliatePk(sale.afiliadoId),
        SK: `COMMISSION#${sale.confirmadoAt}#${sale.ordenId}`,
        entity: 'Commission',
        id,
        ordenId: sale.ordenId,
        afiliadoId: sale.afiliadoId,
        usuarioId: sale.afiliadoUsuarioId,
        refId: sale.refId,
        cursoId: sale.cursoId,
        cursoTitulo: sale.cursoTitulo,
        baseCentavos: sale.baseCentavos,
        tasaBps: 500,
        originalCentavos: amount,
        netoCentavos: amount,
        moneda: 'USD',
        politica: sale.politica,
        creadoAt: sale.confirmadoAt,
        GSI1PK: affiliatePk(sale.afiliadoId),
        GSI1SK: `COMMISSION#${sale.confirmadoAt}#${sale.ordenId}`,
        GSI2PK: 'COMMISSIONS',
        GSI2SK: `${sale.confirmadoAt}#${sale.ordenId}`,
      }
      const notificationId = randomUUID()
      const message = `¡Nueva venta! Obtuviste USD ${(amount / 100).toFixed(2)} de comisión por ${sale.cursoTitulo}.`
      actions.push(
        {
          Put: {
            TableName: this.tableName,
            Item: row,
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Put: {
            TableName: this.tableName,
            Item: {
              ...row,
              affiliatePK: row.PK,
              affiliateSK: row.SK,
              PK: `ORDER#${sale.ordenId}`,
              SK: 'COMMISSION',
              entity: 'CommissionLookup',
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Put: {
            TableName: this.tableName,
            Item: {
              PK: `ORDER#${sale.ordenId}`,
              SK: `MOVEMENT#${sale.confirmadoAt}#SALE`,
              entity: 'CommissionMovement',
              referencia: `venta:${sale.ordenId}`,
              centavos: amount,
              tipo: 'VENTA',
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Put: {
            TableName: this.tableName,
            Item: {
              PK: `USER#${sale.afiliadoUsuarioId}`,
              SK: notificationSk(sale.confirmadoAt, notificationId),
              entity: 'Notification',
              id: notificationId,
              ordenId: sale.ordenId,
              referencia: `venta:${sale.ordenId}`,
              mensaje: message,
              leida: false,
              creadoAt: sale.confirmadoAt,
              GSI1PK: `USER#${sale.afiliadoUsuarioId}`,
              GSI1SK: notificationSk(sale.confirmadoAt, notificationId),
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Update: {
            TableName: this.tableName,
            Key: { PK: affiliatePk(sale.afiliadoId), SK: 'PROFILE' },
            UpdateExpression: 'SET updatedAt = :now ADD totalCentavos :amount, ventas :one',
            ConditionExpression: 'activo = :yes',
            ExpressionAttributeValues: {
              ':amount': amount,
              ':one': 1,
              ':now': eventTime,
              ':yes': true,
            },
          },
        },
        {
          Put: {
            TableName: this.tableName,
            Item: this.outbox('affiliates.comision-registrada.v1', sale.ordenId, {
              afiliadoId: sale.afiliadoId,
              usuarioId: sale.afiliadoUsuarioId,
              refId: sale.refId,
              ordenId: sale.ordenId,
              comisionCentavos: amount,
            }),
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
      )
    } else if (envelope.eventType === 'payments.pago-reembolsado.v1') {
      const orderId = String(payload.ordenId)
      const refundId = String(payload.reembolsoId)
      const order = await this.get(`ORDER#${orderId}`, 'COMMISSION')
      if (order) {
        const refundAmount = Math.round(Number(payload.monto) * 100)
        if (!Number.isSafeInteger(refundAmount) || refundAmount < 0)
          throw new Error('Reembolso inválido')
        const prior = await this.queryAll({ partition: `ORDER#${orderId}`, prefix: 'REFUND#' })
        if (!prior.some(refund => refund.reembolsoId === refundId)) {
          const refunded =
            prior.reduce((sum, refund) => sum + Number(refund.centavos), 0) + refundAmount
          const net = ingresoNeto(Number(order.baseCentavos), refunded)
          const delta = net - Number(order.netoCentavos)
          const movementId = `adjustment:${envelope.eventId}`
          actions.push(
            {
              Put: {
                TableName: this.tableName,
                Item: {
                  PK: `ORDER#${orderId}`,
                  SK: `REFUND#${refundId}`,
                  entity: 'Refund',
                  ordenId: orderId,
                  reembolsoId: refundId,
                  centavos: refundAmount,
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Update: {
                TableName: this.tableName,
                Key: { PK: String(order.affiliatePK), SK: String(order.affiliateSK) },
                UpdateExpression: 'SET netoCentavos = :net',
                ConditionExpression: 'netoCentavos = :before',
                ExpressionAttributeValues: { ':net': net, ':before': Number(order.netoCentavos) },
              },
            },
            {
              Update: {
                TableName: this.tableName,
                Key: { PK: `ORDER#${orderId}`, SK: 'COMMISSION' },
                UpdateExpression: 'SET netoCentavos = :net',
                ConditionExpression: 'netoCentavos = :before',
                ExpressionAttributeValues: { ':net': net, ':before': Number(order.netoCentavos) },
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: {
                  PK: `ORDER#${orderId}`,
                  SK: `MOVEMENT#${eventTime}#${movementId}`,
                  entity: 'CommissionMovement',
                  referencia: movementId,
                  centavos: delta,
                  tipo: 'REEMBOLSO',
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          )
          if (delta !== 0) {
            const notificationId = randomUUID()
            const sk = notificationSk(eventTime, notificationId)
            actions.push({
              Put: {
                TableName: this.tableName,
                Item: {
                  PK: `USER#${String(order.usuarioId)}`,
                  SK: sk,
                  entity: 'Notification',
                  id: notificationId,
                  ordenId: orderId,
                  referencia: movementId,
                  mensaje: `Ingreso ajustado por reembolso: USD ${(delta / 100).toFixed(2)}.`,
                  leida: false,
                  creadoAt: eventTime,
                  GSI1PK: `USER#${String(order.usuarioId)}`,
                  GSI1SK: sk,
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            })
            actions.push({
              Update: {
                TableName: this.tableName,
                Key: { PK: affiliatePk(String(order.afiliadoId)), SK: 'PROFILE' },
                UpdateExpression: 'SET updatedAt = :now ADD totalCentavos :delta',
                ExpressionAttributeValues: { ':delta': delta, ':now': eventTime },
              },
            })
          }
        }
      }
    }
    try {
      await this.client.send(new TransactWriteCommand({ TransactItems: actions }))
    } catch (error) {
      if (await this.eventAlreadyProcessed(envelope.eventId)) return
      if (conditionalFailure(error)) {
        const processedNow = await this.eventAlreadyProcessed(envelope.eventId)
        if (processedNow) return
      }
      throw error
    }
  }
}
