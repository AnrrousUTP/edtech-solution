// Verifica el árbol del doc 04 §10 en cada servicio existente, incluida la
// correspondencia bidireccional entre domain/events/ y el catálogo del doc 05 §2.
import { Glob } from 'bun'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SCHEMA_DE, SERVICIOS } from './arch-check'

const normalizar = (p: string): string => p.replaceAll('\\', '/')

const DIRECTORIOS_OBLIGATORIOS = [
  'src/domain/entities',
  'src/domain/value-objects',
  'src/domain/events',
  'src/domain/ports-out',
  'src/application',
  'src/infrastructure/in/http',
  'src/infrastructure/in/messaging',
  'src/infrastructure/out/persistencia',
  'src/infrastructure/config',
  'migrations',
]

const ARCHIVOS_OBLIGATORIOS = (svc: string) => [
  'src/domain/module.errors.ts',
  `src/infrastructure/${svc}.di.ts`,
  'Dockerfile',
  'package.json',
  'openapi.yaml',
  'events-catalog.md',
]

export function verificarEstructura(raiz: string): string[] {
  const violaciones: string[] = []

  // Catálogo de eventos: los schemas congelados del kernel
  const dirSchemas = join(raiz, 'packages', 'shared-kernel', 'src', 'events', 'schemas')
  const tiposCatalogo = existsSync(dirSchemas)
    ? [...new Glob('*.json').scanSync(dirSchemas)].map(f => f.replace(/\.json$/, ''))
    : []

  for (const svc of SERVICIOS) {
    const dirSvc = join(raiz, 'services', svc)
    if (!existsSync(dirSvc)) continue

    for (const dir of DIRECTORIOS_OBLIGATORIOS) {
      if (!existsSync(join(dirSvc, dir))) violaciones.push(`[estructura] ${svc}: falta ${dir}/`)
    }
    for (const archivo of ARCHIVOS_OBLIGATORIOS(svc)) {
      if (!existsSync(join(dirSvc, archivo)))
        violaciones.push(`[estructura] ${svc}: falta ${archivo}`)
    }

    // application/: carpetas kebab-case con al menos un *.handler.ts
    const dirApp = join(dirSvc, 'src', 'application')
    if (existsSync(dirApp)) {
      for (const entrada of readdirSync(dirApp)) {
        const rutaEntrada = join(dirApp, entrada)
        if (!statSync(rutaEntrada).isDirectory()) continue
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entrada)) {
          violaciones.push(`[estructura] ${svc}: application/${entrada} no está en kebab-case`)
        }
        const handlers = [...new Glob('*.handler.ts').scanSync(rutaEntrada)]
        if (handlers.length === 0) {
          violaciones.push(`[estructura] ${svc}: application/${entrada}/ no contiene *.handler.ts`)
        }
      }
    }

    // domain/events/ ↔ catálogo (bidireccional)
    const contexto = SCHEMA_DE[svc]
    const dirEventos = join(dirSvc, 'src', 'domain', 'events')
    const archivosEvento = existsSync(dirEventos)
      ? [...new Glob('*.event.ts').scanSync(dirEventos)]
      : []
    const tiposDelServicio = tiposCatalogo.filter(t => t.startsWith(`${contexto}.`))

    const tipoDeArchivo = (archivo: string): string => {
      const base = archivo.replace(/\.event\.ts$/, '')
      const conVersion = /\.v\d+$/.test(base) ? base : `${base}.v1`
      return `${contexto}.${conVersion}`
    }

    for (const archivo of archivosEvento) {
      const tipo = tipoDeArchivo(archivo)
      if (!tiposCatalogo.includes(tipo)) {
        violaciones.push(
          `[eventos] ${svc}: domain/events/${archivo} no corresponde a ningún evento del catálogo (esperaba ${tipo})`,
        )
      }
    }
    for (const tipo of tiposDelServicio) {
      const kebab = tipo.slice(contexto.length + 1).replace(/\.v1$/, '')
      const esperadoV1 = `${kebab}.event.ts`
      const esperadoConVersion = `${tipo.slice(contexto.length + 1)}.event.ts`
      if (!archivosEvento.includes(esperadoV1) && !archivosEvento.includes(esperadoConVersion)) {
        violaciones.push(
          `[eventos] ${svc}: el evento ${tipo} del catálogo no tiene archivo en domain/events/`,
        )
      }
    }
  }

  return violaciones.map(normalizar)
}

if (import.meta.main) {
  const violaciones = verificarEstructura(process.cwd())
  if (violaciones.length > 0) {
    console.error(`estructura: ${violaciones.length} violación(es)`)
    for (const v of violaciones) console.error('  ' + v)
    process.exit(1)
  }
  console.log('estructura: OK')
}
