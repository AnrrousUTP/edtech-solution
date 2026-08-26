# 06 — Un repositorio, microservicios de verdad

> **H4/D4.** El mega-prompt exigía repo por servicio. Se cambia a un repositorio único con
> Bun workspaces. Lo que **no** cambia es nada de lo que hace que esto sean microservicios:
> despliegue, datos, escalado y fallo siguen siendo independientes por servicio.

## 1. Qué se conserva y qué se simplifica

| Propiedad de microservicio | ¿Se conserva? | Cómo |
|---|---|---|
| Despliegue independiente | **Sí** | Un ECR, un servicio ECS, una task definition y un job de CI **por servicio**, disparados por path filter |
| Datos independientes | **Sí** | Un schema Postgres + un rol por servicio, sin GRANT cruzado (doc 03 §1) |
| Escalado independiente | **Sí** | Auto scaling por servicio ECS, con su propio target de CPU |
| Aislamiento de fallo | **Sí** | Un servicio caído no tumba a los demás: la comunicación es asíncrona y las colas amortiguan |
| Ciclo de release independiente | **Sí** | Cada servicio tiene su tag de imagen y su versión; nada obliga a desplegar todo junto |
| Aislamiento de **código fuente** | **Sí, pero por harness** | El arch-check falla el build ante cualquier import cruzado (§4). Antes lo garantizaba el sistema de archivos; ahora lo garantiza un test — que además **se puede probar que funciona** (§4.3) |
| Repos separados | **No** | 7 `.git` para una persona |
| Registry npm privado | **No** | El shared-kernel es un workspace local (§3) |
| Bump manual de versión por consumidor | **No** | Todos los servicios ven la misma versión del kernel; el contract test protege lo que importaba (§3.3) |

**El costo real de la simplificación**, dicho sin adornos: se pierde la capacidad de que un
servicio se quede en una versión vieja del shared-kernel. A cambio se gana no tener que
publicar, versionar y actualizar un paquete siete veces por cambio. Con un solo
desarrollador, el segundo problema es mucho más grande que el primero.

## 2. Layout del repositorio

```
edtech-solution/
├── package.json                  # workspaces + scripts raíz
├── bun.lock
├── tsconfig.base.json
├── docker-compose.yml            # Postgres + LocalStack + los 6 servicios + web
├── .dependency-cruiser.cjs
├── DECISIONS.md
├── README.md
├── packages/
│   └── shared-kernel/            # @edtech/shared-kernel
│       ├── src/
│       │   ├── result.type.ts
│       │   ├── domain-event.base.ts
│       │   ├── event-publisher.port.ts
│       │   ├── unique-id.vo.ts
│       │   ├── pagination.cursor.ts
│       │   ├── bus.ts
│       │   ├── aws/{eventbridge.client.ts,sqs.poller.ts,secrets.ts}
│       │   ├── http/{error.middleware.ts,request-context.ts}
│       │   └── testing/{in-memory-event-publisher.ts,fake-clock.ts}
│       ├── CHANGELOG.md
│       └── package.json
├── services/
│   ├── identity-access/
│   ├── catalog/
│   ├── enrollment-progress/
│   ├── gamification/
│   ├── flashcards/
│   └── payments/                 # cada uno con el árbol del doc 04 §10
├── apps/
│   └── web/                      # Next.js (App Router)
├── infra/
│   ├── modules/                  # network, database, messaging, storage, registry,
│   │                             # compute, security, secrets, ai, edge, observability
│   ├── envs/
│   │   ├── dev/                  # un directorio por STATE, no uno solo
│   │   └── prod/
│   └── README.md
├── tools/
│   ├── arch-check.ts             # las 5 reglas de §4
│   ├── check-structure.ts        # verifica el árbol del doc 04 §10
│   ├── lint-convenciones.ts      # Dto / setX / try-catch
│   └── seed/
└── .github/workflows/
    ├── service.yml               # reutilizable, parametrizado por servicio
    └── ci.yml                    # despacha con path filters
```

## 3. Shared kernel

### 3.1 Qué entra

La **regla de los tres usos** del mega-prompt §4.3 se conserva íntegra: nada entra al
kernel salvo que lo usen 3+ servicios. Excepciones autorizadas desde el día uno:

`result.type.ts` · `domain-event.base.ts` (`DomainEvent` + `AggregateRoot`) ·
`event-publisher.port.ts` · `unique-id.vo.ts` · `pagination.cursor.ts` · `bus.ts`
(Command/Query bus) · cliente de EventBridge · poller SQS genérico · lector de Secrets
Manager · middleware de errores HTTP · dobles de test.

### 3.2 Qué NO entra, aunque tiente

- **Entidades de dominio.** Si `Usuario` viviera en el kernel, los seis servicios
  compartirían un modelo y dejaría de haber bounded contexts. Cada servicio define su
  propia noción de usuario, con los campos que le importan.
- **Tipos de payload de eventos.** Tentador y equivocado: acopla al consumidor con la
  representación interna del productor. El consumidor **valida** el payload contra el
  schema publicado y construye lo suyo. Lo que sí se comparte es el **schema JSON**
  (`packages/shared-kernel/src/events/schemas/*.json`), que es un contrato, no un tipo.
- **Acceso a base de datos.** Cada servicio tiene su conexión, su schema y su Drizzle.
- **Lógica de negocio de cualquier tipo.**

### 3.3 Versionado sin registry

`packages/shared-kernel/package.json` lleva versión semántica y `CHANGELOG.md` real,
aunque no se publique en ningún lado. Sirve para dos cosas concretas:

1. La **imagen Docker** de cada servicio registra la versión del kernel con la que se
   construyó (`LABEL kernel_version=`), así que un despliegue viejo es auditable.
2. Un **ADR ligero** (`docs/adr/`) documenta cada adición, con la justificación de la regla
   de los tres usos. Es lo que exige el mega-prompt §10.8.

Lo que protegía el bump manual — que un cambio del kernel no rompa a un consumidor en
silencio — lo protege ahora el CI: **cambiar `packages/shared-kernel/` dispara el pipeline
de los seis servicios**, no solo del que tocaste. Es más estricto que el bump manual, no
menos.

## 4. Aislamiento por harness

### 4.1 Las cinco reglas

| # | Regla | Cómo se verifica |
|---|---|---|
| **A1** | `domain/` no importa `application/` ni `infrastructure/` ni ningún framework | dependency-cruiser |
| **A2** | `application/` no importa `infrastructure/`, `express`, `Request`/`Response`, ni `@aws-sdk/*` | dependency-cruiser |
| **A3** | Solo `infrastructure/` importa Drizzle, Express y el AWS SDK | dependency-cruiser |
| **A4** | Ningún archivo de `services/<a>/` importa de `services/<b>/` — ni relativo, ni por alias, ni por symlink | `tools/arch-check.ts` |
| **A5** | Ningún repositorio de `services/<a>/` menciona el nombre de un schema ajeno en SQL | `tools/arch-check.ts` (grep de `\b<schema>\.` en `out/persistencia/`) |

A4 es la que reemplaza a "repos separados", y se hace con tres comprobaciones combinadas
porque un solo `grep` se puede burlar:

```ts
// tools/arch-check.ts — A4, resumido
for (const svc of SERVICIOS) {
  const archivos = glob(`services/${svc}/src/**/*.ts`)
  for (const f of archivos) {
    const imports = extraerImports(f)           // AST, no regex: cubre import(), export from, require
    for (const imp of imports) {
      const resuelto = resolverRuta(imp, f)     // resuelve relativos y alias de tsconfig
      const otro = SERVICIOS.find(s => s !== svc && resuelto.includes(`services/${s}/`))
      if (otro) fallar(`${f} importa de ${otro}: ${imp}`)
    }
  }
  // y además: el tsconfig del servicio no puede declarar paths hacia otro servicio
  verificarTsconfigSinPathsCruzados(svc)
}
```

Y en `tsconfig.base.json`, la barrera estructural que hace más difícil equivocarse:

```jsonc
{
  "compilerOptions": {
    "paths": {
      "@edtech/shared-kernel": ["./packages/shared-kernel/src/index.ts"]
      // deliberadamente NO hay alias @edtech/catalog, @edtech/payments, etc.
    }
  }
}
```

Cada `services/<x>/package.json` declara **solo** `@edtech/shared-kernel` como dependencia
de workspace. Un import a otro servicio no resuelve ni en el editor.

### 4.2 Lo que el harness NO puede evitar

Honestidad sobre el límite: alguien puede **copiar y pegar** el código de una entidad de un
servicio a otro. Ningún check lo detecta, y con repos separados tampoco. Lo que sí se
detecta es el acoplamiento *estructural*, que es el que rompe despliegues.

### 4.3 El test negativo (obligatorio)

Una regla de arquitectura que nunca falló no está verificada. `tools/arch-check.test.ts`
crea archivos temporales que violan A1, A4 y A5, corre el check y **exige que falle**. Si
el check pasa sobre código malo, el test rojo lo delata. Sin esto, el harness es
decoración.

## 5. Cómo despliega independiente

### 5.1 Path filters en CI

```yaml
# .github/workflows/ci.yml (resumido)
on: { push: { branches: [main, develop] }, pull_request: {} }
jobs:
  cambios:
    runs-on: ubuntu-latest
    outputs: { servicios: ${{ steps.filtro.outputs.changes }} }
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filtro
        with:
          filters: |
            catalog:            ['services/catalog/**',            'packages/shared-kernel/**']
            identity-access:    ['services/identity-access/**',    'packages/shared-kernel/**']
            enrollment-progress:['services/enrollment-progress/**','packages/shared-kernel/**']
            gamification:       ['services/gamification/**',       'packages/shared-kernel/**']
            flashcards:         ['services/flashcards/**',         'packages/shared-kernel/**']
            payments:           ['services/payments/**',           'packages/shared-kernel/**']
            web:                ['apps/web/**']
  construir:
    needs: cambios
    if: needs.cambios.outputs.servicios != '[]'
    strategy: { matrix: { servicio: ${{ fromJSON(needs.cambios.outputs.servicios) }} } }
    uses: ./.github/workflows/service.yml
    with: { servicio: '${{ matrix.servicio }}' }
```

Tocar `services/payments/` construye y despliega **solo** payments. Tocar
`packages/shared-kernel/` construye los seis (§3.3).

### 5.2 Dockerfile por servicio

Bun (D5). Multi-stage, con el lockfile de la raíz para que el caché de capas funcione:

```dockerfile
FROM oven/bun:1-alpine AS deps
WORKDIR /repo
COPY package.json bun.lock ./
COPY packages/shared-kernel/package.json packages/shared-kernel/
COPY services/${SERVICIO}/package.json  services/${SERVICIO}/
RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules node_modules
COPY packages/shared-kernel packages/shared-kernel
COPY services/${SERVICIO}  services/${SERVICIO}
COPY tsconfig.base.json .
RUN bun build services/${SERVICIO}/src/main.ts --target=bun --outdir=/out

FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out /app
COPY services/${SERVICIO}/migrations /app/migrations
LABEL kernel_version="0.1.0"
USER bun
EXPOSE 3000
CMD ["bun", "run", "/app/main.js"]
```

El contenedor aplica sus migraciones al arrancar (`drizzle-kit migrate`) **antes** de
escuchar. Riesgo conocido: una migración fallida impide arrancar y el rollback de imagen
corre la misma migración. Está anotado como **R2** (doc 15) con su mitigación.

### 5.3 Terraform por servicio

Cada `services/<x>/infra/` es su **propio state** (doc 07 §3): ECR, task definition,
servicio ECS, listener rule del ALB, cola SQS, rol IAM y política. Consume los recursos
compartidos (VPC, cluster, ALB, bus, Aurora) por `terraform_remote_state`. Aplicar
`payments` no toca a `catalog`.

## 6. Scripts de la raíz

```jsonc
{
  "workspaces": ["packages/*", "services/*", "apps/*"],
  "scripts": {
    "dev":          "docker compose up",
    "test":         "bun test",
    "arch":         "bun run tools/arch-check.ts && bunx depcruise --config .dependency-cruiser.cjs services packages",
    "estructura":   "bun run tools/check-structure.ts",
    "convenciones": "bun run tools/lint-convenciones.ts",
    "harness":      "bun run arch && bun run estructura && bun run convenciones && bun test",
    "db:seed":      "bun run tools/seed/index.ts"
  }
}
```

`bun run harness` es el comando único que corre todo el guardarraíl. Es lo que corre el
pre-commit y lo que corre CI. Si pasa en local, pasa en CI.
