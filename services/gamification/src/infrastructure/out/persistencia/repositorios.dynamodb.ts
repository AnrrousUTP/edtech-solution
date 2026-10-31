import {
  DynamoRepository,
  type DynamoItem,
  type DynamoPage,
  type DynamoKey,
} from '@edtech/shared-kernel'
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { UniqueId } from '@edtech/shared-kernel'
import {
  PerfilGamificacion,
  type CriterioInsignia,
  type Insignia,
} from '../../../domain/entities/perfil-gamificacion.entity'
import { Certificado, type TipoCertificado } from '../../../domain/entities/certificado.entity'
import type { PerfilRepository } from '../../../domain/ports-out/perfil.repository'
import type { CertificadoRepository } from '../../../domain/ports-out/certificado.repository'
import { CodigoVerificacion } from '../../../domain/value-objects/codigo-verificacion.vo'

type PerfilItem = DynamoItem & {
  entity: 'GamificationProfile'
  usuarioId: string
  nombreTitular: string | null
  puntos: number
  rachaActual: number
  rachaMaxima: number
  ultimaActividad: string | null
  zonaHoraria: string
  version: number
}

type InsigniaItem = DynamoItem & {
  entity: 'GamificationBadge'
  criterio: CriterioInsignia
  referenciaId: string
  otorgadaAt: string
}

type CertificadoItem = DynamoItem & {
  entity: 'Certificate'
  id: string
  usuarioId: string
  tipo: TipoCertificado
  referenciaId: string
  titulo: string
  nombreTitular: string
  codigoVerificacion: string
  pdfS3Key: string | null
  emitidoAt: string
  GSI1PK: string
  GSI1SK: string
}

const perfilPk = (usuarioId: string): string => `USER#${usuarioId}`
const claveInsignia = (insignia: Pick<Insignia, 'criterio' | 'referenciaId'>): string =>
  `${insignia.criterio}|${insignia.referenciaId}`
const claveInsigniaItem = (
  usuarioId: string,
  insignia: Pick<Insignia, 'criterio' | 'referenciaId'>,
): DynamoKey => ({
  PK: perfilPk(usuarioId),
  SK: `BADGE#${insignia.criterio}#${insignia.referenciaId}`,
})

const mapaInsignias = (items: DynamoItem[]): Map<string, Insignia> => {
  const insignias = new Map<string, Insignia>()
  for (const item of items) {
    if (item.entity !== 'GamificationBadge') continue
    const insignia: Insignia = {
      criterio: String(item.criterio) as CriterioInsignia,
      referenciaId: String(item.referenciaId),
      otorgadaAt: new Date(String(item.otorgadaAt)),
    }
    insignias.set(claveInsignia(insignia), insignia)
  }
  return insignias
}

const fechaCreacion = (item: DynamoItem): string =>
  typeof item.createdAt === 'string'
    ? item.createdAt
    : typeof item.updatedAt === 'string'
      ? item.updatedAt
      : new Date().toISOString()

const construirPerfil = (item: PerfilItem, badges: DynamoItem[]): PerfilGamificacion =>
  PerfilGamificacion.reconstruir({
    usuarioId: UniqueId.desde(item.usuarioId),
    nombreTitular: item.nombreTitular,
    puntos: Number(item.puntos),
    rachaActual: Number(item.rachaActual),
    rachaMaxima: Number(item.rachaMaxima),
    ultimaActividad: item.ultimaActividad ? new Date(item.ultimaActividad) : null,
    zonaHoraria: item.zonaHoraria,
    insignias: mapaInsignias(badges),
  } as never)

const mapearCertificado = (item: CertificadoItem | null): Certificado | null => {
  if (!item || item.entity !== 'Certificate') return null
  const codigo = CodigoVerificacion.crear(item.codigoVerificacion)
  if (!codigo.ok) return null
  return Certificado.reconstruir({
    id: UniqueId.desde(item.id),
    usuarioId: UniqueId.desde(item.usuarioId),
    tipo: item.tipo,
    referenciaId: item.referenciaId,
    titulo: item.titulo,
    nombreTitular: item.nombreTitular,
    codigo: codigo.value,
    pdfS3Key: item.pdfS3Key,
    emitidoAt: new Date(item.emitidoAt),
  } as never)
}

const paginas = async <T>(query: (cursor?: string) => Promise<DynamoPage<T>>): Promise<T[]> => {
  const items: T[] = []
  let cursor: string | undefined
  do {
    const page = await query(cursor)
    items.push(...page.items)
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return items
}

/** Perfiles, insignias y sus eventos atómicos en una única tabla DynamoDB. */
export class DynamoPerfilRepository implements PerfilRepository {
  private readonly versiones = new WeakMap<PerfilGamificacion, number | null>()
  private readonly insigniasLeidas = new WeakMap<PerfilGamificacion, Set<string>>()
  private readonly creadoEn = new WeakMap<PerfilGamificacion, string>()

  constructor(private readonly tabla: DynamoRepository) {}

  async porUsuario(usuarioId: UniqueId): Promise<PerfilGamificacion | null> {
    const item = await this.tabla.get<PerfilItem>(
      { PK: perfilPk(usuarioId.valor), SK: 'PROFILE' },
      true,
    )
    if (!item || item.entity !== 'GamificationProfile') return null
    const rows = await paginas(cursor =>
      this.tabla.query<DynamoItem>({
        keyConditionExpression: 'PK = :pk',
        expressionAttributeValues: { ':pk': perfilPk(usuarioId.valor) },
        cursor,
        limit: 100,
        consistentRead: true,
      }),
    )
    const perfil = construirPerfil(item, rows)
    this.versiones.set(perfil, Number(item.version ?? 1))
    this.insigniasLeidas.set(perfil, new Set(perfil.insignias.map(claveInsignia)))
    this.creadoEn.set(perfil, fechaCreacion(item))
    return perfil
  }

  async todos(): Promise<PerfilGamificacion[]> {
    const perfiles = await paginas(cursor =>
      this.tabla.query<PerfilItem>({
        indexName: 'GSI1',
        keyConditionExpression: 'GSI1PK = :pk',
        expressionAttributeValues: { ':pk': 'GAMIFICATION#PROFILES' },
        scanIndexForward: false,
        cursor,
        limit: 100,
      }),
    )
    return Promise.all(
      perfiles.map(async item => {
        const rows = await paginas(cursor =>
          this.tabla.query<DynamoItem>({
            keyConditionExpression: 'PK = :pk',
            expressionAttributeValues: { ':pk': perfilPk(item.usuarioId) },
            cursor,
            limit: 100,
            consistentRead: true,
          }),
        )
        const perfil = construirPerfil(item, rows)
        this.versiones.set(perfil, Number(item.version ?? 1))
        this.insigniasLeidas.set(perfil, new Set(perfil.insignias.map(claveInsignia)))
        this.creadoEn.set(perfil, fechaCreacion(item))
        return perfil
      }),
    )
  }

  async guardar(perfil: PerfilGamificacion): Promise<void> {
    const usuarioId = perfil.usuarioId.valor
    const key = { PK: perfilPk(usuarioId), SK: 'PROFILE' }
    const versionAnterior = this.versiones.get(perfil) ?? null
    const version = (versionAnterior ?? 0) + 1
    const ahora = new Date().toISOString()
    const creadoAt = this.creadoEn.get(perfil) ?? ahora
    const item: PerfilItem = {
      ...key,
      entity: 'GamificationProfile',
      usuarioId,
      nombreTitular: perfil.nombreTitular,
      puntos: perfil.puntos,
      rachaActual: perfil.rachaActual,
      rachaMaxima: perfil.rachaMaxima,
      ultimaActividad: perfil.ultimaActividad?.toISOString() ?? null,
      zonaHoraria: perfil.zonaHoraria,
      version,
      createdAt: creadoAt,
      updatedAt: ahora,
      GSI1PK: 'GAMIFICATION#PROFILES',
      GSI1SK: `${String(perfil.puntos).padStart(12, '0')}#${usuarioId}`,
    }
    const operaciones: NonNullable<Parameters<DynamoRepository['transact']>[0]> = [
      {
        Put: {
          TableName: this.tabla.tableName,
          Item: item,
          ConditionExpression:
            versionAnterior === null ? 'attribute_not_exists(PK)' : 'version = :versionAnterior',
          ...(versionAnterior === null
            ? {}
            : { ExpressionAttributeValues: { ':versionAnterior': versionAnterior } }),
        },
      },
    ]
    const yaGuardadas = this.insigniasLeidas.get(perfil) ?? new Set<string>()
    for (const insignia of perfil.insignias) {
      if (yaGuardadas.has(claveInsignia(insignia))) continue
      operaciones.push({
        Put: {
          TableName: this.tabla.tableName,
          Item: {
            ...claveInsigniaItem(usuarioId, insignia),
            entity: 'GamificationBadge',
            criterio: insignia.criterio,
            referenciaId: insignia.referenciaId,
            otorgadaAt: insignia.otorgadaAt.toISOString(),
            createdAt: ahora,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      })
    }
    const eventos = perfil.pullEvents()
    await this.tabla.transactWithOutbox(operaciones, eventos)
    this.versiones.set(perfil, version)
    this.insigniasLeidas.set(perfil, new Set(perfil.insignias.map(claveInsignia)))
    this.creadoEn.set(perfil, creadoAt)
  }
}

/** Certificados con unicidad por referencia y código, y consultas indexadas. */
export class DynamoCertificadoRepository implements CertificadoRepository {
  private readonly tabla: DynamoRepository
  constructor(
    private readonly client: DynamoDBDocumentClient,
    tableName: string,
  ) {
    this.tabla = new DynamoRepository(client, tableName)
  }

  async porId(id: UniqueId): Promise<Certificado | null> {
    const item = await this.tabla.get<CertificadoItem>(
      { PK: `CERTIFICATE#${id.valor}`, SK: 'PROFILE' },
      true,
    )
    return mapearCertificado(item)
  }

  async porCodigo(codigo: string): Promise<Certificado | null> {
    const lookup = await this.tabla.get<DynamoItem & { certificadoId: string }>(
      { PK: `CERTIFICATE_CODE#${codigo}`, SK: 'CODE' },
      true,
    )
    return lookup?.certificadoId ? this.porId(UniqueId.desde(lookup.certificadoId)) : null
  }

  async porReferencia(
    usuarioId: UniqueId,
    tipo: TipoCertificado,
    referenciaId: string,
  ): Promise<Certificado | null> {
    const lookup = await this.tabla.get<DynamoItem & { certificadoId: string }>(
      { PK: perfilPk(usuarioId.valor), SK: `CERTIFICATE#${tipo}#${referenciaId}` },
      true,
    )
    return lookup?.certificadoId ? this.porId(UniqueId.desde(lookup.certificadoId)) : null
  }

  async porUsuario(usuarioId: UniqueId): Promise<Certificado[]> {
    const items = await paginas(cursor =>
      this.tabla.query<CertificadoItem>({
        indexName: 'GSI1',
        keyConditionExpression: 'GSI1PK = :pk',
        expressionAttributeValues: { ':pk': `CERTIFICATES#USER#${usuarioId.valor}` },
        scanIndexForward: false,
        cursor,
        limit: 100,
      }),
    )
    return items.map(mapearCertificado).filter((item): item is Certificado => item !== null)
  }

  async guardar(certificado: Certificado): Promise<void> {
    const id = certificado.id.valor
    const item: CertificadoItem = {
      PK: `CERTIFICATE#${id}`,
      SK: 'PROFILE',
      entity: 'Certificate',
      id,
      usuarioId: certificado.usuarioId.valor,
      tipo: certificado.tipo,
      referenciaId: certificado.referenciaId,
      titulo: certificado.titulo,
      nombreTitular: certificado.nombreTitular,
      codigoVerificacion: certificado.codigo.valor,
      pdfS3Key: certificado.pdfS3Key,
      emitidoAt: certificado.emitidoAt.toISOString(),
      GSI1PK: `CERTIFICATES#USER#${certificado.usuarioId.valor}`,
      GSI1SK: `${certificado.emitidoAt.toISOString()}#${id}`,
    }
    const eventos = certificado.pullEvents()
    if (eventos.length > 0) {
      await this.tabla.transactWithOutbox(
        [
          {
            Put: {
              TableName: this.tabla.tableName,
              Item: item,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Put: {
              TableName: this.tabla.tableName,
              Item: {
                PK: perfilPk(certificado.usuarioId.valor),
                SK: `CERTIFICATE#${certificado.tipo}#${certificado.referenciaId}`,
                entity: 'CertificateReference',
                certificadoId: id,
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Put: {
              TableName: this.tabla.tableName,
              Item: {
                PK: `CERTIFICATE_CODE#${certificado.codigo.valor}`,
                SK: 'CODE',
                entity: 'CertificateCode',
                certificadoId: id,
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
        eventos,
      )
      return
    }

    if (!certificado.pdfS3Key) return
    await this.client.send(
      new UpdateCommand({
        TableName: this.tabla.tableName,
        Key: { PK: item.PK, SK: item.SK },
        UpdateExpression: 'SET pdfS3Key = :pdfS3Key',
        ConditionExpression: 'attribute_exists(PK) AND id = :id',
        ExpressionAttributeValues: { ':pdfS3Key': certificado.pdfS3Key, ':id': id },
      }),
    )
  }
}
