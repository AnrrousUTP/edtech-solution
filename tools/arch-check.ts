// Reglas A1, A4 y A5 del doc 06 §4, por AST (no regex). dependency-cruiser cubre
// A1-A3 además; acá A1 se re-verifica para que el test negativo (doc 12 §6) pruebe
// las tres reglas sin depender del binario externo.
import ts from 'typescript'
import { Glob } from 'bun'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export const SERVICIOS = [
  'identity-access',
  'catalog',
  'enrollment-progress',
  'gamification',
  'flashcards',
  'payments',
] as const

export const SCHEMA_DE: Record<string, string> = {
  'identity-access': 'identity',
  catalog: 'catalog',
  'enrollment-progress': 'enrollment',
  gamification: 'gamification',
  flashcards: 'flashcards',
  payments: 'payments',
}

const normalizar = (p: string): string => p.replaceAll('\\', '/')

export function extraerImports(nombreArchivo: string, contenido: string): string[] {
  const sf = ts.createSourceFile(nombreArchivo, contenido, ts.ScriptTarget.Latest, true)
  const specs: string[] = []
  const visitar = (n: ts.Node): void => {
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier)
    ) {
      specs.push(n.moduleSpecifier.text)
    } else if (ts.isCallExpression(n)) {
      const e = n.expression
      const esRequire = ts.isIdentifier(e) && e.text === 'require'
      const esImportDinamico = e.kind === ts.SyntaxKind.ImportKeyword
      const arg = n.arguments[0]
      if ((esRequire || esImportDinamico) && arg && ts.isStringLiteral(arg)) specs.push(arg.text)
    }
    ts.forEachChild(n, visitar)
  }
  visitar(sf)
  return specs
}

const archivosDe = (dir: string, patron: string): string[] => {
  if (!existsSync(dir)) return []
  return [...new Glob(patron).scanSync(dir)].map(f => join(dir, f))
}

export function verificarArquitectura(raiz: string): string[] {
  const violaciones: string[] = []

  for (const svc of SERVICIOS) {
    const dirSvc = join(raiz, 'services', svc)
    if (!existsSync(dirSvc)) continue

    // ── A1 + A4 sobre imports resueltos ──────────────────────────────────
    for (const archivo of archivosDe(join(dirSvc, 'src'), '**/*.ts')) {
      const rel = normalizar(archivo)
      const contenido = readFileSync(archivo, 'utf8')
      const enDomain = rel.includes('/src/domain/')
      const esTest = rel.endsWith('.test.ts')

      for (const spec of extraerImports(archivo, contenido)) {
        const esRelativo = spec.startsWith('.')
        const resuelto = esRelativo ? normalizar(resolve(dirname(archivo), spec)) : spec

        // A4: nada importa de otro servicio (relativo, alias o paquete)
        for (const otro of SERVICIOS) {
          if (otro === svc) continue
          if (
            (esRelativo && resuelto.includes(`/services/${otro}/`)) ||
            (!esRelativo && (spec === `@edtech/${otro}` || spec.includes(`services/${otro}`)))
          ) {
            violaciones.push(`[A4] ${rel} importa de ${otro}: "${spec}"`)
          }
        }

        if (enDomain) {
          // A1: domain no importa application/ ni infrastructure/
          if (
            esRelativo &&
            (resuelto.includes(`/services/${svc}/src/application/`) ||
              resuelto.includes(`/services/${svc}/src/infrastructure/`))
          ) {
            violaciones.push(`[A1] ${rel} (domain) importa hacia afuera: "${spec}"`)
          }
          // A1: domain no importa frameworks ni SDKs — solo el shared-kernel.
          // Los *.test.ts pueden importar bun:test y los dobles del kernel (A-06).
          if (!esRelativo && spec !== '@edtech/shared-kernel' && !esTest) {
            violaciones.push(
              `[A1] ${rel} (domain) importa "${spec}" (solo se permite @edtech/shared-kernel)`,
            )
          }
        }
      }
    }

    // ── A4: el tsconfig del servicio no declara paths hacia otro servicio ──
    const tsconfigPath = join(dirSvc, 'tsconfig.json')
    if (existsSync(tsconfigPath)) {
      const leido = ts.readConfigFile(tsconfigPath, p => readFileSync(p, 'utf8'))
      const paths = (leido.config?.compilerOptions?.paths ?? {}) as Record<string, string[]>
      for (const [alias, destinos] of Object.entries(paths)) {
        for (const destino of destinos) {
          for (const otro of SERVICIOS) {
            if (otro !== svc && normalizar(destino).includes(`services/${otro}`)) {
              violaciones.push(
                `[A4] ${normalizar(tsconfigPath)} declara paths "${alias}" hacia ${otro}`,
              )
            }
          }
        }
      }
    }

    // ── A5: la persistencia no menciona schemas ajenos ────────────────────
    const schemaPropio = SCHEMA_DE[svc]
    const schemasAjenos = Object.values(SCHEMA_DE).filter(s => s !== schemaPropio)
    const archivosPersistencia = [
      ...archivosDe(join(dirSvc, 'src', 'infrastructure', 'out', 'persistencia'), '**/*.ts'),
      ...archivosDe(join(dirSvc, 'migrations'), '**/*.sql'),
    ]
    for (const archivo of archivosPersistencia) {
      const contenido = readFileSync(archivo, 'utf8')
      for (const ajeno of schemasAjenos) {
        if (new RegExp(`\\b${ajeno}\\.`).test(contenido)) {
          violaciones.push(`[A5] ${normalizar(archivo)} menciona el schema ajeno "${ajeno}."`)
        }
      }
    }
  }

  return violaciones
}

if (import.meta.main) {
  const violaciones = verificarArquitectura(process.cwd())
  if (violaciones.length > 0) {
    console.error(`arch-check: ${violaciones.length} violación(es)`)
    for (const v of violaciones) console.error('  ' + v)
    process.exit(1)
  }
  console.log('arch-check: OK')
}
