import { randomUUID } from 'node:crypto'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type NativeAttributeValue,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb'
import { UniqueId } from '@edtech/shared-kernel'
import { Orden } from '../../../domain/entities/orden.entity'
import type { AtribucionReferida } from '../../../domain/ports-out/atribucion.port'
import type {
  OrdenRepository,
  PrecioProyeccionRepository,
  PrecioProyectado,
  WebhookCrudo,
  WebhookRepository,
} from '../../../domain/ports-out/orden.repository'
import { Dinero } from '../../../domain/value-objects/dinero.vo'

type Item = Record<string, NativeAttributeValue> & { PK: string; SK: string }
type TransactionItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number]
type OrdenItem = Item & {
  entity: 'Order'
  id: string
  usuarioId: string
  cursoId: string
  montoCentavos: number
  moneda: string
  versionPrecio: number
  estado: string
  expiraAt: string
  createdAt: string
}

const orderKey = (id: string) => ({ PK: `ORDER#${id}`, SK: 'DATA' })
const uniquePaypalKey = (kind: 'ORDER' | 'CAPTURE', id: string) => ({
  PK: `PAYPAL_${kind}#${id}`,
  SK: 'ORDER',
})
const uniquePurchasePartition = (userId: string, courseId: string) =>
  `USER#${userId}#COURSE#${courseId}`
const isConditional = (error: unknown): boolean => {
  const failure = error as {
    name?: string
    CancellationReasons?: Array<{ Code?: string }>
  }
  if (failure.name === 'ConditionalCheckFailedException') return true
  return (
    failure.name === 'TransactionCanceledException' &&
    Boolean(failure.CancellationReasons?.some(reason => reason.Code === 'ConditionalCheckFailed'))
  )
}

const stateForIndex = (state: string): 'PENDING' | 'CAPTURED' | null =>
  state === 'PENDIENTE' ? 'PENDING' : state === 'CAPTURADA' ? 'CAPTURED' : null

const orderFrom = (item: OrdenItem): Orden => {
  const refunds = Array.isArray(item.reembolsos)
    ? (item.reembolsos as Array<{ id: string; centavos: number }>)
    : []
  return Orden.reconstruir({
    id: UniqueId.desde(item.id),
    usuarioId: UniqueId.desde(item.usuarioId),
    cursoId: UniqueId.desde(item.cursoId),
    monto: Dinero.desdeCentavos(Number(item.montoCentavos), String(item.moneda)),
    versionPrecio: Number(item.versionPrecio),
    estado: item.estado,
    paypalOrderId: typeof item.paypalOrderId === 'string' ? item.paypalOrderId : null,
    paypalCaptureId: typeof item.paypalCaptureId === 'string' ? item.paypalCaptureId : null,
    comision:
      typeof item.comisionCentavos === 'number'
        ? Dinero.desdeCentavos(item.comisionCentavos, String(item.moneda))
        : null,
    neto:
      typeof item.netoCentavos === 'number'
        ? Dinero.desdeCentavos(item.netoCentavos, String(item.moneda))
        : null,
    expiraAt: new Date(String(item.expiraAt)),
    createdAt: new Date(String(item.createdAt)),
    atribucion: (item.atribucion as AtribucionReferida | null | undefined) ?? null,
    cursoTitulo: String(item.cursoTitulo ?? ''),
    reembolsos: refunds,
  } as never)
}

const toOrderItem = (order: Orden, version: number): OrdenItem => ({
  PK: `ORDER#${order.id.valor}`,
  SK: 'DATA',
  entity: 'Order',
  id: order.id.valor,
  usuarioId: order.usuarioId.valor,
  cursoId: order.cursoId.valor,
  montoCentavos: order.monto.centavos,
  moneda: order.monto.moneda,
  versionPrecio: order.versionPrecio,
  estado: order.estado,
  paypalOrderId: order.paypalOrderId ?? undefined,
  paypalCaptureId: order.paypalCaptureId ?? undefined,
  comisionCentavos: order.comision?.centavos,
  netoCentavos: order.neto?.centavos,
  expiraAt: order.expiraAt.toISOString(),
  createdAt: order.createdAt.toISOString(),
  atribucion: order.atribucion ?? undefined,
  cursoTitulo: order.cursoTitulo,
  reembolsos: order.reembolsos,
  version,
  GSI1PK: `USER#${order.usuarioId.valor}`,
  GSI1SK: `${order.createdAt.toISOString()}#${order.id.valor}`,
  GSI2PK: 'ORDERS',
  GSI2SK: `${order.createdAt.toISOString()}#${order.id.valor}`,
})

/** Repositorio de pagos DynamoDB. Las órdenes, llaves únicas y outbox viven en
 * la tabla del dominio; cambios y eventos se confirman en una sola transacción.
 */
export class DynamoPaymentsRepository implements OrdenRepository, WebhookRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!tableName.trim()) throw new Error('Falta el nombre de la tabla de pagos')
  }

  private async get(key: { PK: string; SK: string }): Promise<Item | null> {
    const result = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: key, ConsistentRead: true }),
    )
    return (result.Item as Item | undefined) ?? null
  }

  private async queryIds(input: {
    pk: string
    index?: 'GSI1' | 'GSI2'
    beginsWith?: string
    before?: string
    descending?: boolean
  }): Promise<string[]> {
    const ids: string[] = []
    let cursor: Record<string, NativeAttributeValue> | undefined
    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          ...(input.index ? { IndexName: input.index } : {}),
          KeyConditionExpression: [
            `${input.index ? `${input.index}PK` : 'PK'} = :pk`,
            ...(input.beginsWith
              ? [`begins_with(${input.index ? `${input.index}SK` : 'SK'}, :prefix)`]
              : []),
            ...(input.before ? [`${input.index ? `${input.index}SK` : 'SK'} <= :before`] : []),
          ].join(' AND '),
          ExpressionAttributeValues: {
            ':pk': input.pk,
            ...(input.beginsWith ? { ':prefix': input.beginsWith } : {}),
            ...(input.before ? { ':before': input.before } : {}),
          },
          ScanIndexForward: input.descending !== true,
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      )
      for (const row of result.Items ?? []) {
        const id = row.orderId ?? row.id
        if (typeof id === 'string') ids.push(id)
      }
      cursor = result.LastEvaluatedKey as Record<string, NativeAttributeValue> | undefined
    } while (cursor)
    return ids
  }

  private async getOrders(ids: string[]): Promise<Orden[]> {
    const orders: Orden[] = []
    for (const id of ids) {
      const item = await this.get(orderKey(id))
      if (item?.entity === 'Order') orders.push(orderFrom(item as OrdenItem))
    }
    return orders
  }

  async porId(id: UniqueId): Promise<Orden | null> {
    const item = await this.get(orderKey(id.valor))
    return item?.entity === 'Order' ? orderFrom(item as OrdenItem) : null
  }

  async porPaypalOrderId(paypalOrderId: string): Promise<Orden | null> {
    const lookup = await this.get(uniquePaypalKey('ORDER', paypalOrderId))
    return typeof lookup?.orderId === 'string' ? this.porId(UniqueId.desde(lookup.orderId)) : null
  }

  async porPaypalCaptureId(captureId: string): Promise<Orden | null> {
    if (!captureId) return null
    const lookup = await this.get(uniquePaypalKey('CAPTURE', captureId))
    return typeof lookup?.orderId === 'string' ? this.porId(UniqueId.desde(lookup.orderId)) : null
  }

  async pendienteDe(usuarioId: UniqueId, cursoId: UniqueId): Promise<Orden | null> {
    const ids = await this.queryIds({
      pk: uniquePurchasePartition(usuarioId.valor, cursoId.valor),
      beginsWith: 'PENDING#',
      descending: true,
    })
    return (await this.getOrders(ids))[0] ?? null
  }

  async capturadaDe(usuarioId: UniqueId, cursoId: UniqueId): Promise<Orden | null> {
    const ids = await this.queryIds({
      pk: uniquePurchasePartition(usuarioId.valor, cursoId.valor),
      beginsWith: 'CAPTURED#',
      descending: true,
    })
    return (await this.getOrders(ids))[0] ?? null
  }

  async porUsuario(usuarioId: UniqueId): Promise<Orden[]> {
    const ids = await this.queryIds({
      pk: `USER#${usuarioId.valor}`,
      index: 'GSI1',
      descending: true,
    })
    return this.getOrders(ids)
  }

  async todas(): Promise<Orden[]> {
    const ids = await this.queryIds({ pk: 'ORDERS', index: 'GSI2', descending: true })
    return this.getOrders(ids)
  }

  async vencidas(ahora: Date): Promise<Orden[]> {
    const ids = await this.queryIds({
      pk: 'ORDERS#PENDING',
      before: `EXPIRES#${ahora.toISOString()}\uffff`,
    })
    return this.getOrders(ids)
  }

  async guardar(order: Orden): Promise<void> {
    const events = order.pullEvents()
    const key = orderKey(order.id.valor)
    const actual = await this.get(key)
    if (actual?.entity === 'Order') {
      const stored = actual as OrdenItem
      if (stored.estado === 'REEMBOLSADA' && order.estado !== 'REEMBOLSADA') return
      if (stored.estado === 'CAPTURADA' && !['CAPTURADA', 'REEMBOLSADA'].includes(order.estado))
        return
    }

    const priorRefunds = Array.isArray(actual?.reembolsos)
      ? (actual?.reembolsos as Array<{ id: string; centavos: number }>)
      : []
    const refunds = [
      ...new Map(
        [...priorRefunds, ...order.reembolsos].map(refund => [refund.id, refund]),
      ).values(),
    ]
    const totalRefunded = refunds.reduce((sum, refund) => sum + refund.centavos, 0)
    const finalState =
      totalRefunded >= order.monto.centavos && refunds.length > 0 ? 'REEMBOLSADA' : order.estado
    const version = Number(actual?.version ?? 0) + 1
    const orderItem = toOrderItem(order, version)
    orderItem.estado = finalState
    orderItem.reembolsos = refunds

    const transaction: TransactionItem[] = [
      {
        Put: {
          TableName: this.tableName,
          Item: orderItem,
          ...(actual
            ? {
                ConditionExpression: 'version = :version',
                ExpressionAttributeValues: { ':version': Number(actual.version) },
              }
            : { ConditionExpression: 'attribute_not_exists(PK)' }),
        },
      },
    ]
    if (
      actual &&
      typeof actual.paypalOrderId === 'string' &&
      actual.paypalOrderId !== order.paypalOrderId
    ) {
      transaction.push({
        Delete: {
          TableName: this.tableName,
          Key: uniquePaypalKey('ORDER', actual.paypalOrderId),
        },
      })
    }
    if (
      actual &&
      typeof actual.paypalCaptureId === 'string' &&
      actual.paypalCaptureId !== order.paypalCaptureId
    ) {
      transaction.push({
        Delete: {
          TableName: this.tableName,
          Key: uniquePaypalKey('CAPTURE', actual.paypalCaptureId),
        },
      })
    }
    const indexState = stateForIndex(finalState)
    const previousState = stateForIndex(String(actual?.estado ?? ''))
    if (actual && previousState && previousState !== indexState) {
      transaction.push({
        Delete: {
          TableName: this.tableName,
          Key: {
            PK: uniquePurchasePartition(String(actual.usuarioId), String(actual.cursoId)),
            SK: `${previousState}#${String(actual.createdAt)}#${order.id.valor}`,
          },
        },
      })
      if (previousState === 'PENDING') {
        transaction.push({
          Delete: {
            TableName: this.tableName,
            Key: {
              PK: 'ORDERS#PENDING',
              SK: `EXPIRES#${String(actual.expiraAt)}#${order.id.valor}`,
            },
          },
        })
      }
    }
    if (indexState && previousState !== indexState) {
      transaction.push({
        Put: {
          TableName: this.tableName,
          Item: {
            PK: uniquePurchasePartition(order.usuarioId.valor, order.cursoId.valor),
            SK: `${indexState}#${order.createdAt.toISOString()}#${order.id.valor}`,
            entity: 'OrderLookup',
            orderId: order.id.valor,
          },
        },
      })
      if (indexState === 'PENDING') {
        transaction.push({
          Put: {
            TableName: this.tableName,
            Item: {
              PK: 'ORDERS#PENDING',
              SK: `EXPIRES#${order.expiraAt.toISOString()}#${order.id.valor}`,
              entity: 'ExpiringOrder',
              orderId: order.id.valor,
            },
          },
        })
      }
    }
    if (order.paypalOrderId && actual?.paypalOrderId !== order.paypalOrderId) {
      transaction.push({
        Put: {
          TableName: this.tableName,
          Item: {
            ...uniquePaypalKey('ORDER', order.paypalOrderId),
            entity: 'UniqueOrder',
            orderId: order.id.valor,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      })
    }
    if (order.paypalCaptureId && actual?.paypalCaptureId !== order.paypalCaptureId) {
      transaction.push({
        Put: {
          TableName: this.tableName,
          Item: {
            ...uniquePaypalKey('CAPTURE', order.paypalCaptureId),
            entity: 'UniqueCapture',
            orderId: order.id.valor,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      })
    }
    for (const event of events) {
      const occurredAt = event.occurredAt.toISOString()
      transaction.push({
        Put: {
          TableName: this.tableName,
          Item: {
            PK: `OUTBOX#${event.eventId}`,
            SK: 'EVENT',
            entity: 'Outbox',
            eventId: event.eventId,
            eventType: event.eventType,
            aggregateId: event.aggregateId,
            occurredAt,
            correlationId: randomUUID(),
            payload: event.payload(),
            GSI1PK: 'OUTBOX#PENDING',
            GSI1SK: `${occurredAt}#${event.eventId}`,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      })
    }
    if (transaction.length > 100)
      throw new Error('La orden excede el límite transaccional de DynamoDB')
    await this.client.send(new TransactWriteCommand({ TransactItems: transaction }))
  }

  async registrarSiEsNuevo(webhook: WebhookCrudo): Promise<boolean> {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: `WEBHOOK#${webhook.paypalEventId}`,
            SK: 'RAW',
            entity: 'PaypalWebhook',
            paypalEventId: webhook.paypalEventId,
            eventType: webhook.eventType,
            firmaValida: webhook.firmaValida,
            payload: webhook.payload,
            receivedAt: this.now().toISOString(),
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      )
      return true
    } catch (error) {
      if (isConditional(error)) {
        const previous = await this.get({ PK: `WEBHOOK#${webhook.paypalEventId}`, SK: 'RAW' })
        return Boolean(previous?.firmaValida && !previous.enqueuedAt)
      }
      throw error
    }
  }

  async marcarEncolado(paypalEventId: string): Promise<void> {
    await this.client
      .send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: `WEBHOOK#${paypalEventId}`, SK: 'RAW' },
          UpdateExpression: 'SET enqueuedAt = :at',
          ConditionExpression: 'firmaValida = :valid AND attribute_not_exists(enqueuedAt)',
          ExpressionAttributeValues: { ':at': this.now().toISOString(), ':valid': true },
        }),
      )
      .catch(error => {
        if (!isConditional(error)) throw error
      })
  }

  async porEventId(paypalEventId: string): Promise<WebhookCrudo | null> {
    const item = await this.get({ PK: `WEBHOOK#${paypalEventId}`, SK: 'RAW' })
    return item
      ? {
          paypalEventId: String(item.paypalEventId),
          eventType: String(item.eventType),
          firmaValida: Boolean(item.firmaValida),
          payload: item.payload,
        }
      : null
  }

  async marcarProcesado(paypalEventId: string, error?: string): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: `WEBHOOK#${paypalEventId}`, SK: 'RAW' },
        UpdateExpression: 'SET processedAt = :at, processingError = :error',
        ConditionExpression: 'entity = :entity',
        ExpressionAttributeValues: {
          ':at': this.now().toISOString(),
          ':error': error ?? null,
          ':entity': 'PaypalWebhook',
        },
      }),
    )
  }
}

/** Proyección de precios enviada por el catálogo; versiones viejas nunca
 * sobrescriben una publicación más reciente. */
export class DynamoPrecioProyeccionRepository implements PrecioProyeccionRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!tableName.trim()) throw new Error('Falta el nombre de la tabla de pagos')
  }

  async porCursoId(cursoId: string): Promise<PrecioProyectado | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: `COURSE#${cursoId}`, SK: 'PRICE' },
        ConsistentRead: true,
      }),
    )
    const item = result.Item
    if (!item || item.entity !== 'CoursePrice') return null
    return {
      cursoId: String(item.cursoId),
      titulo: String(item.titulo),
      monto: Number(item.montoCentavos) / 100,
      moneda: String(item.moneda),
      versionPrecio: Number(item.versionPrecio),
      publicado: Boolean(item.publicado),
    }
  }

  async guardar(
    precio: PrecioProyectado,
    evento?: { eventId: string; eventType: string },
  ): Promise<void> {
    const at = this.now().toISOString()
    const write: TransactionItem = {
      Update: {
        TableName: this.tableName,
        Key: { PK: `COURSE#${precio.cursoId}`, SK: 'PRICE' },
        UpdateExpression:
          'SET entity = :entity, cursoId = :cursoId, titulo = :titulo, montoCentavos = :monto, moneda = :moneda, versionPrecio = :version, publicado = :publicado, updatedAt = :at',
        ConditionExpression: 'attribute_not_exists(versionPrecio) OR versionPrecio <= :version',
        ExpressionAttributeValues: {
          ':entity': 'CoursePrice',
          ':cursoId': precio.cursoId,
          ':titulo': precio.titulo,
          ':monto': Math.round(precio.monto * 100),
          ':moneda': precio.moneda,
          ':version': precio.versionPrecio,
          ':publicado': precio.publicado,
          ':at': at,
        },
      },
    }
    const transaction: TransactionItem[] = [write]
    if (evento) transaction.push(this.eventMarker(evento, at))
    try {
      await this.client.send(new TransactWriteCommand({ TransactItems: transaction }))
    } catch (error) {
      if (!isConditional(error)) throw error
    }
  }

  private eventMarker(evento: { eventId: string; eventType: string }, at: string): TransactionItem {
    return {
      Put: {
        TableName: this.tableName,
        Item: {
          PK: `EVENT#${evento.eventId}`,
          SK: 'PROCESSED',
          entity: 'ProcessedEvent',
          eventType: evento.eventType,
          processedAt: at,
          expiresAt: Math.floor(Date.parse(at) / 1000) + 90 * 24 * 60 * 60,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    }
  }

  async marcarPublicado(
    cursoId: string,
    publicado: boolean,
    evento?: { eventId: string; eventType: string },
  ): Promise<void> {
    const at = this.now().toISOString()
    const transaction: TransactionItem[] = [
      {
        Update: {
          TableName: this.tableName,
          Key: { PK: `COURSE#${cursoId}`, SK: 'PRICE' },
          UpdateExpression: 'SET publicado = :publicado, updatedAt = :at',
          ConditionExpression: 'entity = :entity',
          ExpressionAttributeValues: {
            ':publicado': publicado,
            ':at': at,
            ':entity': 'CoursePrice',
          },
        },
      },
    ]
    if (evento) transaction.push(this.eventMarker(evento, at))
    try {
      await this.client.send(new TransactWriteCommand({ TransactItems: transaction }))
    } catch (error) {
      if (!isConditional(error)) throw error
    }
  }
}
