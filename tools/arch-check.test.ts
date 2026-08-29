// El test negativo del harness (doc 12 §6): genera archivos que violan A1, A4, A5
// y dos reglas de convenciones, y EXIGE que los checks fallen con el mensaje
// correcto. Si el harness pasa sobre código malo, este test se pone rojo.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { verificarArquitectura } from './arch-check'
import { verificarConvenciones } from './lint-convenciones'

const raiz = join(tmpdir(), `edtech-arch-negativo-${process.pid}`)

const escribir = (ruta: string, contenido: string): void => {
  const completa = join(raiz, ruta)
  mkdirSync(join(completa, '..'), { recursive: true })
  writeFileSync(completa, contenido)
}

beforeAll(() => {
  rmSync(raiz, { recursive: true, force: true })

  // A1: domain importa un framework
  escribir(
    'services/catalog/src/domain/entities/mala.entity.ts',
    `import express from 'express'\nexport const x = express`,
  )
  // A1: domain importa infrastructure
  escribir(
    'services/catalog/src/domain/services/malo.service.ts',
    `import { repo } from '../../infrastructure/out/persistencia/repo'\nexport const y = repo`,
  )
  // A4: import relativo cruzado entre servicios
  escribir(
    'services/catalog/src/application/cosa/cosa.handler.ts',
    `import { Matricula } from '../../../../enrollment-progress/src/domain/entities/matricula.entity'\nexport const z = Matricula`,
  )
  // A4: import dinámico cruzado (el AST debe cubrir import())
  escribir(
    'services/payments/src/infrastructure/in/http/malo.ts',
    `export const cargar = () => import('../../../../../catalog/src/domain/entities/curso.entity')`,
  )
  // A5: la persistencia menciona un schema ajeno
  escribir(
    'services/catalog/src/infrastructure/out/persistencia/malo.repository.ts',
    `export const q = 'SELECT * FROM enrollment.matriculas'`,
  )
  // Convenciones: sufijo Dto
  escribir(
    'services/catalog/src/application/otra/tipos.ts',
    `export interface CursoDto { id: string }`,
  )
  // Convenciones: try/catch en application/
  escribir(
    'services/catalog/src/application/otra/otra.handler.ts',
    `export const h = async () => { try { return 1 } catch { return 2 } }`,
  )
  // Y un archivo LIMPIO, para verificar que no hay falsos positivos
  escribir(
    'services/gamification/src/domain/entities/limpia.entity.ts',
    `import { AggregateRoot } from '@edtech/shared-kernel'\nexport class Limpia extends AggregateRoot {}`,
  )
})

afterAll(() => {
  rmSync(raiz, { recursive: true, force: true })
})

describe('el harness falla ante código que viola las reglas', () => {
  test('A1: domain importando frameworks o hacia afuera', () => {
    const violaciones = verificarArquitectura(raiz)
    expect(violaciones.some(v => v.startsWith('[A1]') && v.includes('express'))).toBe(true)
    expect(violaciones.some(v => v.startsWith('[A1]') && v.includes('malo.service'))).toBe(true)
  })

  test('A4: import cruzado entre servicios (estático y dinámico)', () => {
    const violaciones = verificarArquitectura(raiz)
    expect(
      violaciones.some(
        v =>
          v.startsWith('[A4]') && v.includes('cosa.handler') && v.includes('enrollment-progress'),
      ),
    ).toBe(true)
    expect(
      violaciones.some(v => v.startsWith('[A4]') && v.includes('malo.ts') && v.includes('catalog')),
    ).toBe(true)
  })

  test('A5: persistencia mencionando un schema ajeno', () => {
    const violaciones = verificarArquitectura(raiz)
    expect(
      violaciones.some(
        v => v.startsWith('[A5]') && v.includes('malo.repository') && v.includes('enrollment.'),
      ),
    ).toBe(true)
  })

  test('convenciones: sufijo Dto y try/catch en application/', () => {
    const violaciones = verificarConvenciones(raiz)
    expect(violaciones.some(v => v.startsWith('[Dto]') && v.includes('CursoDto'))).toBe(true)
    expect(violaciones.some(v => v.startsWith('[try-catch]') && v.includes('otra.handler'))).toBe(
      true,
    )
  })

  test('el archivo limpio no genera falsos positivos', () => {
    const violaciones = verificarArquitectura(raiz)
    expect(violaciones.some(v => v.includes('limpia.entity'))).toBe(false)
  })
})
