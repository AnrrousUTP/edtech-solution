// Lint de convenciones propias (doc 12 §3), por AST. Los *.test.ts quedan exentos
// de las reglas de try/catch y new Date() (DECISIONS.md, A-06).
import ts from 'typescript'
import { Glob } from 'bun'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const normalizar = (p: string): string => p.replaceAll('\\', '/')

const archivosDe = (dir: string, patron: string): string[] => {
  if (!existsSync(dir)) return []
  return [...new Glob(patron).scanSync(dir)].map(f => join(dir, f))
}

const lineaDe = (sf: ts.SourceFile, pos: number): number =>
  sf.getLineAndCharacterOfPosition(pos).line + 1

const tieneJustificacion = (sf: ts.SourceFile, nodo: ts.Node): boolean => {
  const texto = sf.getFullText()
  const linea = lineaDe(sf, nodo.getStart(sf))
  const lineas = texto.split('\n')
  const actual = lineas[linea - 1] ?? ''
  const anterior = lineas[linea - 2] ?? ''
  return actual.includes('eslint-disable') || anterior.includes('eslint-disable')
}

export function verificarConvenciones(raiz: string): string[] {
  const violaciones: string[] = []

  const archivos = [
    ...archivosDe(join(raiz, 'services'), '*/src/**/*.ts'),
    ...archivosDe(join(raiz, 'apps'), '*/src/**/*.{ts,tsx}'),
  ]

  for (const archivo of archivos) {
    const rel = normalizar(archivo)
    const esTest = rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')
    const enDomain = rel.includes('/src/domain/')
    const enApplication = rel.includes('/src/application/')
    const enEntities = rel.includes('/src/domain/entities/')
    const enConfig = rel.includes('/infrastructure/config/')
    const contenido = readFileSync(archivo, 'utf8')
    const sf = ts.createSourceFile(archivo, contenido, ts.ScriptTarget.Latest, true)

    // Regla: sin sufijo Dto en el nombre de archivo
    if (/dto\.(ts|tsx)$/i.test(rel) || /\.dto\./i.test(rel)) {
      violaciones.push(`[Dto] ${rel}: usa <X>Command / <X>Query / <X>Response`)
    }

    const visitar = (n: ts.Node): void => {
      // Sin sufijo Dto en tipos, clases e interfaces
      if (
        (ts.isClassDeclaration(n) ||
          ts.isInterfaceDeclaration(n) ||
          ts.isTypeAliasDeclaration(n)) &&
        n.name &&
        /Dto$/.test(n.name.text)
      ) {
        violaciones.push(
          `[Dto] ${rel}:${lineaDe(sf, n.getStart(sf))} "${n.name.text}": usa <X>Command / <X>Query / <X>Response`,
        )
      }

      // Sin setX() públicos en entidades de dominio
      if (
        enEntities &&
        ts.isMethodDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        /^set[A-Z]/.test(n.name.text)
      ) {
        const esPrivado = n.modifiers?.some(
          m => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword,
        )
        if (!esPrivado) {
          violaciones.push(
            `[setX] ${rel}:${lineaDe(sf, n.getStart(sf))} "${n.name.text}": validez por construcción — expón una operación de negocio, no un setter`,
          )
        }
      }

      // Sin try/catch en application/
      if (enApplication && !esTest && ts.isTryStatement(n)) {
        violaciones.push(`[try-catch] ${rel}:${lineaDe(sf, n.getStart(sf))}: usa Result (Ok/Err)`)
      }

      // Sin console.log
      if (
        ts.isPropertyAccessExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === 'console'
      ) {
        violaciones.push(
          `[console] ${rel}:${lineaDe(sf, n.getStart(sf))}: usa el logger estructurado del kernel`,
        )
      }

      // Sin process.env fuera de infrastructure/config/
      if (
        !enConfig &&
        ts.isPropertyAccessExpression(n) &&
        n.name.text === 'env' &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === 'process'
      ) {
        violaciones.push(
          `[process.env] ${rel}:${lineaDe(sf, n.getStart(sf))}: la configuración se lee en un solo lugar y se inyecta`,
        )
      }

      // Sin any sin justificación
      if (n.kind === ts.SyntaxKind.AnyKeyword && !tieneJustificacion(sf, n)) {
        violaciones.push(`[any] ${rel}:${lineaDe(sf, n.getStart(sf))}: any sin justificación`)
      }

      // Sin new Date() / Date.now() en domain/
      if (enDomain && !esTest) {
        if (
          ts.isNewExpression(n) &&
          ts.isIdentifier(n.expression) &&
          n.expression.text === 'Date'
        ) {
          violaciones.push(
            `[fecha] ${rel}:${lineaDe(sf, n.getStart(sf))}: el dominio recibe la hora, no la pide (inyecta Reloj)`,
          )
        }
        if (
          ts.isCallExpression(n) &&
          ts.isPropertyAccessExpression(n.expression) &&
          ts.isIdentifier(n.expression.expression) &&
          n.expression.expression.text === 'Date' &&
          n.expression.name.text === 'now'
        ) {
          violaciones.push(
            `[fecha] ${rel}:${lineaDe(sf, n.getStart(sf))}: el dominio recibe la hora, no la pide (inyecta Reloj)`,
          )
        }
      }

      ts.forEachChild(n, visitar)
    }
    visitar(sf)
  }

  return violaciones
}

if (import.meta.main) {
  const violaciones = verificarConvenciones(process.cwd())
  if (violaciones.length > 0) {
    console.error(`convenciones: ${violaciones.length} violación(es)`)
    for (const v of violaciones) console.error('  ' + v)
    process.exit(1)
  }
  console.log('convenciones: OK')
}
