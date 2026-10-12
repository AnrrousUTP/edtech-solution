import { randomBytes, timingSafeEqual } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
  UpdateCommand,
  type NativeAttributeValue,
} from '@aws-sdk/lib-dynamodb'
import type { SobreEvento } from '@edtech/shared-kernel'
import type { Terminal, TerminalConfig } from '../../../domain/entities/terminal.entity'
import { TerminalError } from '../../../domain/module.errors'
import type { TerminalRepository } from '../../../domain/ports-out/terminal.repository'

type Item = Record<string, NativeAttributeValue> & { PK: string; SK: string }
type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number]
const terminalPk = (id: string): string => `TERMINAL#${id}`
const keyTerminal = (id: string) => ({ PK: terminalPk(id), SK: 'CONFIG' })
const proyectado = (usuarioId: string): { PK: string; SK: string } => ({
  PK: `AFFILIATE#${usuarioId}`,
  SK: 'PROFILE',
})
const esConflicto = (error: unknown): boolean =>
  (error as { name?: string })?.name === 'ConditionalCheckFailedException' ||
  (error as { name?: string })?.name === 'TransactionCanceledException'

/** Repositorio DynamoDB del terminal virtual. El dispositivo es un agregado
 * pequeño; solicitudes, proyección de afiliados y avisos usan registros aparte.
 */
export class DynamoTerminalRepository implements TerminalRepository {
  private readonly client: DynamoDBDocumentClient

  constructor(
    private readonly tableName: string,
    private readonly deviceId: string,
    private readonly offlineMs = 90_000,
    options: { region?: string; endpoint?: string } = {},
  ) {
    if (!tableName.trim()) throw new Error('Falta el nombre de tabla DynamoDB para IoT')
    const local = Boolean(options.endpoint)
    this.client = DynamoDBDocumentClient.from(
      new DynamoDBClient({
        ...(options.region ? { region: options.region } : {}),
        ...(options.endpoint ? { endpoint: options.endpoint } : {}),
        ...(local ? { credentials: { accessKeyId: 'local', secretAccessKey: 'local' } } : {}),
      }),
      { marshallOptions: { removeUndefinedValues: true } },
    )
  }

  private terminal(item: Item): Terminal {
    const at = item.lastSeen ? new Date(String(item.lastSeen)).toISOString() : null
    return {
      id: String(item.id),
      usuarioId: item.usuarioId ? String(item.usuarioId) : null,
      refId: item.refId ? String(item.refId) : null,
      mensaje: String(item.mensaje ?? ''),
      habilitado: Boolean(item.habilitado),
      version: Number(item.version ?? 0),
      versionReportada: Number(item.versionReportada ?? 0),
      ultimaConexion: at,
      conectado: at !== null && Date.now() - Date.parse(at) < this.offlineMs,
      ultimoAviso: item.ultimoAviso ? String(item.ultimoAviso) : null,
      previewToken: String(item.previewToken ?? ''),
    }
  }

  private async get<T extends Item>(key: { PK: string; SK: string }): Promise<T | null> {
    const result = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: key, ConsistentRead: true }),
    )
    return (result.Item as T | undefined) ?? null
  }

  async inicializar(): Promise<void> {
    const exists = await this.get(keyTerminal(this.deviceId))
    if (exists) return
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            ...keyTerminal(this.deviceId),
            entity: 'Terminal',
            id: this.deviceId,
            usuarioId: null,
            refId: null,
            mensaje: '',
            habilitado: false,
            version: 1,
            versionReportada: 0,
            lastSeen: null,
            ultimoAviso: null,
            previewToken: randomBytes(24).toString('hex'),
            GSI1PK: 'TERMINALES',
            GSI1SK: `DEVICE#${this.deviceId}`,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      )
    } catch (error) {
      if (!esConflicto(error)) throw error
    }
  }

  async solicitar(usuarioId: string): Promise<void> {
    const affiliate = await this.get(proyectado(usuarioId))
    if (!affiliate) {
      throw new TerminalError(
        'AFILIADO_NO_LISTO',
        'Activa el programa de afiliados y espera unos segundos',
        409,
      )
    }
    const now = new Date().toISOString()
    await this.client
      .send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: 'TERMINAL#REQUESTS',
            SK: `USER#${usuarioId}`,
            entity: 'TerminalRequest',
            usuarioId,
            creadoAt: now,
            GSI1PK: 'TERMINAL#REQUESTS',
            GSI1SK: `${now}#${usuarioId}`,
          },
          ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        }),
      )
      .catch(error => {
        if (!esConflicto(error)) throw error
      })
  }

  async mio(usuarioId: string): Promise<{ terminal: Terminal | null; solicitud: string | null }> {
    const assignment = await this.get<{ PK: string; SK: string; terminalId: string }>({
      PK: `USER#${usuarioId}`,
      SK: 'TERMINAL',
    })
    const [item, request] = await Promise.all([
      assignment ? this.get(keyTerminal(assignment.terminalId)) : Promise.resolve(null),
      this.get({ PK: 'TERMINAL#REQUESTS', SK: `USER#${usuarioId}` }),
    ])
    return {
      terminal: item ? this.terminal(item) : null,
      solicitud: item ? 'ASIGNADA' : request ? 'SOLICITADA' : null,
    }
  }

  async configurar(
    usuarioId: string,
    mensaje: string,
    habilitado: boolean,
    version: number,
  ): Promise<void> {
    const key = keyTerminal(this.deviceId)
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: key,
          UpdateExpression:
            'SET mensaje = :mensaje, habilitado = :habilitado, version = version + :one',
          ConditionExpression: 'usuarioId = :usuario AND version = :version',
          ExpressionAttributeValues: {
            ':mensaje': mensaje,
            ':habilitado': habilitado,
            ':one': 1,
            ':usuario': usuarioId,
            ':version': version,
          },
        }),
      )
    } catch (error) {
      if (esConflicto(error)) {
        throw new TerminalError(
          'CONFIGURACION_CONFLICTO',
          'El terminal no está asignado o su configuración cambió; actualiza la página',
          409,
        )
      }
      throw error
    }
  }

  async asignar(usuarioId: string | null): Promise<void> {
    const terminal = await this.get(keyTerminal(this.deviceId))
    if (!terminal) throw new TerminalError('TERMINAL_NO_ENCONTRADO', 'Terminal no encontrado', 404)
    const affiliate = usuarioId ? await this.get(proyectado(usuarioId)) : null
    if (usuarioId && !affiliate) {
      throw new TerminalError(
        'AFILIADO_NO_LISTO',
        'El afiliado aún no está registrado en terminales',
        409,
      )
    }
    const previousUser = terminal.usuarioId ? String(terminal.usuarioId) : null
    const now = new Date().toISOString()
    const writes: TransactItem[] = [
      {
        Update: {
          TableName: this.tableName,
          Key: keyTerminal(this.deviceId),
          UpdateExpression:
            'SET usuarioId = :usuario, refId = :refId, habilitado = :habilitado, version = version + :one, previewToken = :token, ultimoAviso = :empty',
          ConditionExpression: 'version = :version',
          ExpressionAttributeValues: {
            ':usuario': usuarioId,
            ':refId': affiliate?.refId ?? null,
            ':habilitado': usuarioId !== null,
            ':one': 1,
            ':version': terminal.version,
            ':token': randomBytes(24).toString('hex'),
            ':empty': '',
          },
        },
      },
    ]
    if (previousUser && previousUser !== usuarioId) {
      writes.push({
        Delete: {
          TableName: this.tableName,
          Key: { PK: `USER#${previousUser}`, SK: 'TERMINAL' },
        },
      })
    }
    if (usuarioId) {
      writes.push({
        Put: {
          TableName: this.tableName,
          Item: {
            PK: `USER#${usuarioId}`,
            SK: 'TERMINAL',
            entity: 'TerminalAssignment',
            terminalId: this.deviceId,
            updatedAt: now,
          },
        },
      })
    }
    try {
      await this.client.send(new TransactWriteCommand({ TransactItems: writes }))
    } catch (error) {
      if (esConflicto(error)) {
        throw new TerminalError(
          'CONFIGURACION_CONFLICTO',
          'El terminal cambió; vuelve a intentarlo',
          409,
        )
      }
      throw error
    }
    await this.#acknowledgePendingAlerts()
    if (previousUser && previousUser !== usuarioId) {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: 'TERMINAL#REQUESTS',
            SK: `USER#${previousUser}`,
            entity: 'TerminalRequest',
            usuarioId: previousUser,
            creadoAt: now,
            GSI1PK: 'TERMINAL#REQUESTS',
            GSI1SK: `${now}#${previousUser}`,
          },
        }),
      )
    }
    if (usuarioId) {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: 'TERMINAL#REQUESTS',
            SK: `USER#${usuarioId}`,
            entity: 'TerminalRequest',
            usuarioId,
            creadoAt: now,
            GSI1PK: 'TERMINAL#REQUESTS',
            GSI1SK: `${now}#${usuarioId}`,
          },
        }),
      )
    }
  }

  async admin(): Promise<Record<string, unknown>> {
    const [devices, afiliadosRegistrados, requests] = await Promise.all([
      this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: { ':pk': 'TERMINALES' },
        }),
      ),
      this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: { ':pk': 'AFFILIATES' },
        }),
      ),
      this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: { ':pk': 'TERMINAL#REQUESTS' },
        }),
      ),
    ])
    const requestMap = new Map((requests.Items ?? []).map(item => [String(item.usuarioId), item]))
    return {
      terminales: (devices.Items ?? [])
        .filter(item => item.entity === 'Terminal')
        .map(item => this.terminal(item as Item)),
      afiliados: (afiliadosRegistrados.Items ?? [])
        .filter(item => item.entity === 'AffiliateProjection')
        .map(item => ({
          usuarioId: item.usuarioId,
          afiliadoId: item.afiliadoId,
          refId: item.refId,
          solicitadoAt: requestMap.get(String(item.usuarioId))?.creadoAt ?? null,
        })),
    }
  }

  async vista(id: string, token: string) {
    const item = id === this.deviceId ? await this.get(keyTerminal(id)) : null
    const stored = String(item?.previewToken ?? '')
    if (
      !item ||
      !/^[a-f0-9]{48}$/.test(token) ||
      token.length !== stored.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(stored))
    ) {
      throw new TerminalError('VISTA_NO_DISPONIBLE', 'La vista no está disponible', 404)
    }
    const {
      usuarioId: _usuario,
      previewToken: _token,
      ultimaConexion: _at,
      ...publico
    } = this.terminal(item)
    return publico
  }

  async procesar(sobre: SobreEvento): Promise<void> {
    const markerKey = { PK: `EVENT#${sobre.eventId}`, SK: 'PROCESSED' }
    const marker: TransactItem = {
      Put: {
        TableName: this.tableName,
        Item: {
          ...markerKey,
          entity: 'ProcessedEvent',
          eventType: sobre.eventType,
          expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    }
    const payload = sobre.payload
    let operations: TransactItem[] = [marker]
    if (sobre.eventType === 'affiliates.afiliado-activado.v1') {
      operations.push({
        Put: {
          TableName: this.tableName,
          Item: {
            PK: `AFFILIATE#${String(payload.usuarioId)}`,
            SK: 'PROFILE',
            entity: 'AffiliateProjection',
            usuarioId: String(payload.usuarioId),
            afiliadoId: String(payload.afiliadoId),
            refId: String(payload.refId),
            GSI1PK: 'AFFILIATES',
            GSI1SK: `USER#${String(payload.usuarioId)}`,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      })
    } else if (sobre.eventType === 'affiliates.comision-registrada.v1') {
      const terminal = await this.get(keyTerminal(this.deviceId))
      if (terminal?.habilitado && terminal.usuarioId === String(payload.usuarioId)) {
        operations.push({
          ConditionCheck: {
            TableName: this.tableName,
            Key: keyTerminal(this.deviceId),
            ConditionExpression: 'usuarioId = :usuario AND habilitado = :yes',
            ExpressionAttributeValues: { ':usuario': String(payload.usuarioId), ':yes': true },
          },
        })
        operations.push({
          Put: {
            TableName: this.tableName,
            Item: {
              PK: terminalPk(this.deviceId),
              SK: `ALERT#${sobre.occurredAt}#${sobre.eventId}`,
              entity: 'TerminalAlert',
              id: sobre.eventId,
              ordenId: String(payload.ordenId ?? ''),
              texto: 'Nueva venta confirmada',
              creadoAt: sobre.occurredAt,
              GSI1PK: terminalPk(this.deviceId),
              GSI1SK: `ALERT#${sobre.occurredAt}#${sobre.eventId}`,
            },
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
          },
        })
      }
    } else if (sobre.eventType === 'iot.telemetry.interno') {
      const terminal = await this.get(keyTerminal(this.deviceId))
      if (terminal) {
        const version = Number(payload.version ?? 0)
        const acknowledged =
          typeof payload.alertId === 'string' ? await this.#alertById(payload.alertId) : null
        operations.push({
          Update: {
            TableName: this.tableName,
            Key: keyTerminal(this.deviceId),
            UpdateExpression:
              acknowledged && !acknowledged.ackAt
                ? 'SET lastSeen = :at, versionReportada = :reported, ultimoAviso = :texto'
                : 'SET lastSeen = :at, versionReportada = :reported',
            ConditionExpression:
              'version >= :reported AND (attribute_not_exists(versionReportada) OR versionReportada <= :reported)',
            ExpressionAttributeValues: {
              ':at': sobre.occurredAt,
              ':reported': version,
              ...(acknowledged && !acknowledged.ackAt ? { ':texto': acknowledged.texto } : {}),
            },
          },
        })
        if (acknowledged && !acknowledged.ackAt) {
          operations.push({
            Update: {
              TableName: this.tableName,
              Key: { PK: acknowledged.PK, SK: acknowledged.SK },
              UpdateExpression: 'SET ackAt = :at',
              ConditionExpression: 'attribute_not_exists(ackAt)',
              ExpressionAttributeValues: { ':at': sobre.occurredAt },
            },
          })
        }
      }
    }
    try {
      await this.client.send(new TransactWriteCommand({ TransactItems: operations }))
    } catch (error) {
      if (esConflicto(error)) return
      throw error
    }
  }

  async configuracion(): Promise<TerminalConfig> {
    const item = await this.get(keyTerminal(this.deviceId))
    if (!item) throw new TerminalError('TERMINAL_NO_ENCONTRADO', 'Terminal no encontrado', 404)
    return {
      version: Number(item.version),
      refId: item.refId ? String(item.refId) : null,
      mensaje: String(item.mensaje),
      habilitado: Boolean(item.habilitado),
    }
  }

  async alertas(): Promise<{ id: string; texto: string }[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': terminalPk(this.deviceId), ':prefix': 'ALERT#' },
        ScanIndexForward: false,
        Limit: 100,
      }),
    )
    const terminal = await this.get(keyTerminal(this.deviceId))
    if (!terminal?.habilitado) return []
    const cutoff = Date.now() - 60 * 60 * 1000
    return (result.Items ?? [])
      .filter(item => !item.ackAt && Date.parse(String(item.creadoAt)) >= cutoff)
      .slice(0, 20)
      .map(item => ({ id: String(item.id), texto: String(item.texto) }))
  }

  async #alertById(id: string): Promise<Item | null> {
    const results = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        FilterExpression: 'id = :id',
        ExpressionAttributeValues: {
          ':pk': terminalPk(this.deviceId),
          ':prefix': 'ALERT#',
          ':id': id,
        },
      }),
    )
    return (results.Items?.find(item => item.id === id) as Item | undefined) ?? null
  }

  async #acknowledgePendingAlerts(): Promise<void> {
    const now = new Date().toISOString()
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': terminalPk(this.deviceId), ':prefix': 'ALERT#' },
        FilterExpression: 'attribute_not_exists(ackAt)',
      }),
    )
    for (const item of result.Items ?? []) {
      await this.client
        .send(
          new UpdateCommand({
            TableName: this.tableName,
            Key: { PK: item.PK, SK: item.SK },
            UpdateExpression: 'SET ackAt = :now',
            ConditionExpression: 'attribute_not_exists(ackAt)',
            ExpressionAttributeValues: { ':now': now },
          }),
        )
        .catch(error => {
          if (!esConflicto(error)) throw error
        })
    }
  }
}
