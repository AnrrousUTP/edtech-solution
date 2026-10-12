import { UniqueId, type DomainEvent } from '@edtech/shared-kernel'
import { DynamoRepository, type DynamoItem } from '@edtech/shared-kernel'
import { Usuario } from '../../../domain/entities/usuario.entity'
import { Email } from '../../../domain/value-objects/email.vo'
import { Nivel } from '../../../domain/value-objects/nivel.vo'
import type { UsuarioRepository } from '../../../domain/ports-out/usuario.repository'

type UsuarioItem = DynamoItem & {
  entity: 'Usuario'
  id: string
  email: string
  nombreVisible: string
  avatarUrl: string | null
  pais: string | null
  idioma: string
  rol: string
  nivel: string
  origenNivel: string
  createdAt: string
  updatedAt: string
  version: number
}

const deItem = (item: UsuarioItem): Usuario => {
  const email = Email.crear(item.email)
  const nivel = Nivel.crear(item.nivel)
  if (!email.ok || !nivel.ok) throw new Error('Fila de usuario DynamoDB inválida')
  return Usuario.reconstruir({
    id: UniqueId.desde(item.id),
    email: email.value,
    nivel: nivel.value,
    nombreVisible: item.nombreVisible,
    avatarUrl: item.avatarUrl ?? null,
    pais: item.pais ?? null,
    idioma: item.idioma,
    rol: item.rol,
    origenNivel: item.origenNivel,
  } as never)
}

export class DynamoUsuarioRepository implements UsuarioRepository {
  constructor(private readonly table: DynamoRepository) {}

  async porId(id: UniqueId): Promise<Usuario | null> {
    const row = await this.table.get<UsuarioItem>({ PK: `USUARIO#${id.valor}`, SK: 'PERFIL' }, true)
    return row ? deItem(row) : null
  }

  async todos(): Promise<Usuario[]> {
    const rows: UsuarioItem[] = []
    let cursor: string | undefined
    do {
      const page = await this.table.query<UsuarioItem>({
        indexName: 'GSI1',
        keyConditionExpression: 'GSI1PK = :type',
        expressionAttributeValues: { ':type': 'TIPO#USUARIO' },
        limit: 100,
        scanIndexForward: false,
        ...(cursor ? { cursor } : {}),
      })
      rows.push(...page.items)
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    return rows.map(deItem)
  }

  async guardar(usuario: Usuario, eventos: DomainEvent[] = []): Promise<void> {
    const id = usuario.id.valor
    const current = await this.table.get<UsuarioItem>({ PK: `USUARIO#${id}`, SK: 'PERFIL' }, true)
    const now = new Date().toISOString()
    const createdAt = current?.createdAt ?? now
    const normalizedEmail = usuario.email.valor.trim().toLowerCase()
    const item: UsuarioItem = {
      PK: `USUARIO#${id}`,
      SK: 'PERFIL',
      GSI1PK: 'TIPO#USUARIO',
      GSI1SK: `CREADO#${createdAt}#${id}`,
      entity: 'Usuario',
      id,
      email: usuario.email.valor,
      nombreVisible: usuario.nombreVisible,
      avatarUrl: usuario.avatarUrl,
      pais: usuario.pais,
      idioma: usuario.idioma,
      rol: usuario.rol,
      nivel: usuario.nivel.valor,
      origenNivel: usuario.origenNivel,
      createdAt,
      updatedAt: now,
      version: (current?.version ?? 0) + 1,
    }
    const items = [
      {
        Put: {
          TableName: this.table.tableName,
          Item: item,
          ConditionExpression: current
            ? 'version = :expectedVersion'
            : 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
          ...(current
            ? { ExpressionAttributeValues: { ':expectedVersion': current.version } }
            : {}),
        },
      },
      ...(!current || current.email.toLowerCase() !== normalizedEmail
        ? [
            ...(current
              ? [
                  {
                    Delete: {
                      TableName: this.table.tableName,
                      Key: { PK: `EMAIL#${current.email.toLowerCase()}`, SK: 'UNIQUE' },
                      ConditionExpression: 'usuarioId = :id',
                      ExpressionAttributeValues: { ':id': id },
                    },
                  },
                ]
              : []),
            {
              Put: {
                TableName: this.table.tableName,
                Item: {
                  PK: `EMAIL#${normalizedEmail}`,
                  SK: 'UNIQUE',
                  entity: 'EmailLookup',
                  usuarioId: id,
                  createdAt: now,
                },
                ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
              },
            },
          ]
        : []),
    ]
    await this.table.transactWithOutbox(items, eventos)
  }
}
