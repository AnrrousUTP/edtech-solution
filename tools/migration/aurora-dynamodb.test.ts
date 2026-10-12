import { describe, expect, it } from 'bun:test'
import { fingerprintRow, legacyPartitionKey, stableLegacyRecordKey } from './aurora-dynamodb'

describe('migración Aurora → DynamoDB', () => {
  it('genera huellas estables independiente del orden de propiedades', () => {
    expect(fingerprintRow({ id: 'a', datos: { z: 2, a: 1 } })).toBe(
      fingerprintRow({ datos: { a: 1, z: 2 }, id: 'a' }),
    )
  })

  it('separa particiones por esquema, tabla y clave de origen', () => {
    const identity = legacyPartitionKey('identity', 'usuarios', ['u-1'])
    expect(identity).toBe(legacyPartitionKey('identity', 'usuarios', ['u-1']))
    expect(identity).not.toBe(legacyPartitionKey('catalog', 'usuarios', ['u-1']))
    expect(identity).not.toBe(legacyPartitionKey('identity', 'usuarios', ['u-2']))
  })

  it('conserva la identidad de filas sin PK aunque PostgreSQL cambie ctid', () => {
    const base = {
      schema: 'catalog' as const,
      table: 'bloques',
      primaryKey: [],
      key: ['(0,1)'],
      fingerprint: 'a'.repeat(64),
      duplicate: 0,
      data: { contenido: 'texto' },
    }
    expect(stableLegacyRecordKey(base)).toBe(stableLegacyRecordKey({ ...base, key: ['(2,18)'] }))
  })

  it('distingue registros repetidos sin clave natural', () => {
    const base = {
      schema: 'catalog' as const,
      table: 'bloques',
      primaryKey: [],
      key: ['(0,1)'],
      fingerprint: 'b'.repeat(64),
      duplicate: 0,
      data: { contenido: 'repetido' },
    }
    expect(stableLegacyRecordKey(base)).not.toBe(stableLegacyRecordKey({ ...base, duplicate: 1 }))
  })
})
