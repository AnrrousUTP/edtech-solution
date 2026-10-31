import { describe, expect, it } from 'bun:test'
import { QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { UniqueId } from '@edtech/shared-kernel'
import type { Bloque } from '../../../domain/ports-out/curso.repository'
import { DynamoCatalogStore } from './repositorios.dynamodb'

describe('DynamoCatalogStore', () => {
  it('usa el mismo orden normalizado en la clave y el elemento de cada bloque', async () => {
    let operaciones: Array<{ Put?: { Item?: Record<string, unknown> } }> = []
    const client = {
      send: async (command: unknown) => {
        if (command instanceof QueryCommand) return { Items: [] }
        if (command instanceof TransactWriteCommand) {
          operaciones = command.input.TransactItems as typeof operaciones
          return {}
        }
        throw new Error('Comando DynamoDB inesperado')
      },
    }
    const store = new DynamoCatalogStore(
      client as never,
      'catalog-test',
      {} as never,
      'content-test',
    )
    const bloques = [
      { orden: undefined, tipo: 'TEXTO', contenido: { markdown: 'A' } },
      { orden: undefined, tipo: 'TEXTO', contenido: { markdown: 'B' } },
    ] as unknown as Bloque[]

    await store.reemplazarBloques(UniqueId.desde(crypto.randomUUID()), bloques)

    const elementos = operaciones.map(operacion => operacion.Put?.Item)
    expect(elementos.map(item => item?.SK)).toEqual(['BLOCK#00001', 'BLOCK#00002'])
    expect(elementos.map(item => item?.orden)).toEqual([1, 2])
  })
})
