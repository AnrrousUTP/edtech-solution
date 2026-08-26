# 12 — Harness y CI

> El harness es lo que hace que las reglas de los docs 04 y 06 sean **verificables** en vez
> de aspiracionales. Regla del mega-prompt §10, que se conserva: **no se avanza de un
> servicio al siguiente si el harness falla para el servicio actual.**

## 1. El comando único

```bash
bun run harness     # arch + estructura + convenciones + tests
```

Lo mismo corre en el pre-commit y en CI. Si pasa en local, pasa en CI: sin esa propiedad,
el harness se vuelve un peaje que la gente aprende a saltar.

## 2. Reglas de dependencia (dependency-cruiser + arch-check)

```js
// .dependency-cruiser.cjs
module.exports = {
  forbidden: [
    { name: 'dominio-no-importa-app-ni-infra', severity: 'error',
      from: { path: 'services/[^/]+/src/domain' },
      to:   { path: 'services/[^/]+/src/(application|infrastructure)' } },

    { name: 'dominio-sin-frameworks', severity: 'error',
      from: { path: 'services/[^/]+/src/domain' },
      to:   { dependencyTypes: ['npm'],
              pathNot: '^@edtech/shared-kernel$' } },

    { name: 'app-sin-express-ni-aws', severity: 'error',
      from: { path: 'services/[^/]+/src/application' },
      to:   { path: 'node_modules/(express|@aws-sdk|drizzle-orm|pg)' } },

    { name: 'solo-infra-usa-orm-y-sdk', severity: 'error',
      from: { pathNot: 'services/[^/]+/src/infrastructure' },
      to:   { path: 'node_modules/(drizzle-orm|@aws-sdk|pg)' } },

    { name: 'sin-ciclos', severity: 'error', from: {}, to: { circular: true } },
  ],
}
```

Y `tools/arch-check.ts` cubre lo que dependency-cruiser no ve (doc 06 §4):

- **A4** — ningún import cruzado entre `services/<a>/` y `services/<b>/`, resuelto por AST
  (cubre `import`, `import()`, `export from` y `require`), más la verificación de que
  ningún `tsconfig` declara `paths` hacia otro servicio.
- **A5** — ningún archivo de `infrastructure/out/persistencia/` de un servicio menciona el
  nombre de un schema ajeno (`grep` de `\b(catalog|enrollment|identity|gamification|flashcards|payments)\.`
  excluyendo el propio).

## 3. Lint de convenciones propias

`tools/lint-convenciones.ts`, con AST (regex sobre TypeScript da falsos positivos dentro de
strings y comentarios):

| Regla | Alcance | Mensaje |
|---|---|---|
| Sin sufijo `Dto` en tipos, clases, interfaces o archivos | todo `services/` | `Usa <X>Command / <X>Query / <X>Response` |
| Sin métodos `setX()` públicos en clases de `domain/entities/` | `domain/` | `Validez por construcción: expón una operación de negocio, no un setter` |
| Sin `try/catch` en `application/` | `application/` | `Usa Result (Ok/Err)` |
| Sin `console.log` | `services/`, `apps/` | `Usa el logger estructurado del kernel` |
| Sin `process.env` fuera de `infrastructure/config/` | `services/` | `La configuración se lee en un solo lugar y se inyecta` |
| Sin `any` sin `// eslint-disable-next-line` con justificación | todo | — |
| Sin `Date.now()` / `new Date()` en `domain/` | `domain/` | `El dominio recibe la hora, no la pide (testabilidad)` |

## 4. Verificación de estructura

`tools/check-structure.ts` compara el árbol real de cada servicio contra el del doc 04 §10:

- Los directorios obligatorios existen: `domain/{entities,value-objects,events,ports-out}`,
  `application/`, `infrastructure/{in/http,in/messaging,out/persistencia,config}`.
- Existen `module.errors.ts`, `<servicio>.di.ts`, `Dockerfile`, `openapi.yaml`,
  `events-catalog.md`, `migrations/`.
- Cada carpeta de `application/` está en kebab-case y contiene un `*.handler.ts`.
- Cada archivo de `domain/events/` corresponde a un evento del doc 05 §2, y viceversa.
  **Un evento en el código que no está en el catálogo falla el build** — es lo que impide
  que el catálogo se vuelva ficción a las tres semanas.

## 5. Tests

| Nivel | Qué | Dónde | Corre en |
|---|---|---|---|
| Dominio | Invariantes y transiciones, sin mocks | `domain/**/*.test.ts` | siempre (ms) |
| Aplicación | Caso de uso con dobles de ports-out | `application/**/*.test.ts` | siempre (ms) |
| Persistencia | El repositorio guarda y reconstruye la entidad igual | `infrastructure/out/**/*.test.ts` | con Postgres en Docker |
| Mensajería | **Idempotencia**: entregar el mismo evento dos veces produce un solo efecto | `infrastructure/in/messaging/**/*.test.ts` | con Postgres |
| **Contrato de eventos** | El JSON publicado valida contra el schema congelado | `tests/contratos/` | siempre |
| Fuga de respuestas | Ningún endpoint público devuelve `respuesta_correcta` (I-5) | `tests/seguridad/` | siempre |
| E2E | El flujo del doc 00 §DoD, contra `docker compose` | `tests/e2e/` | manual + nightly |

**Los contract tests son la pieza que reemplaza a los repos separados.** Un servicio publica
un evento; el test valida ese JSON contra `packages/shared-kernel/src/events/schemas/<tipo>.json`,
que es el contrato público. Y del otro lado, el consumidor tiene un test que construye un
evento **desde el schema** y verifica que su handler lo procesa. Cambiar un payload rompe el
test del productor **y** el del consumidor, en el mismo pipeline, antes del merge.

```ts
// tests/contratos/payments.pago-confirmado.test.ts
test('el evento publicado cumple el contrato v1', async () => {
  const publisher = new InMemoryEventPublisher()
  const handler = new CapturarPagoHandler(repoDoble, pasarelaDoble, publisher)
  await handler.execute({ _tag: 'CapturarPago', ordenId: ORDEN_ID })

  const evento = publisher.publicados.find(e => e.eventType === 'payments.pago-confirmado.v1')
  expect(evento).toBeDefined()
  expect(validarContra('payments.pago-confirmado.v1', evento!.payload())).toEqual({ valido: true })
})
```

**Cobertura.** Se exige ≥ 85 % en `domain/` y `application/`, y **no se exige nada** en
`infrastructure/`. Un umbral global empuja a escribir tests de getters para llegar al
número; el umbral donde está la lógica empuja a probar lo que importa.

## 6. El test negativo del harness (obligatorio)

Un guardarraíl que nunca falló no está verificado. `tools/arch-check.test.ts` genera
archivos temporales que violan A1, A4, A5 y dos reglas de convenciones, corre el check y
**exige que falle con el mensaje correcto**. Si el harness pasa sobre código malo, este
test se pone rojo.

Sin esto, es perfectamente posible tener un arch-check con un glob mal escrito que no
analiza nada y siempre pasa en verde. Es un fallo silencioso y común.

## 7. Pre-commit (Husky + lint-staged)

```json
{
  "lint-staged": {
    "*.ts":  ["bunx eslint --fix", "bun run tools/lint-convenciones.ts"],
    "*.{ts,tsx,json,md}": ["bunx prettier --write"]
  }
}
```

El hook corre `lint-staged` + `bun run arch` + los tests **de dominio y aplicación** (los
rápidos). Los de persistencia y E2E quedan para CI: un pre-commit que tarda dos minutos se
saltea con `--no-verify` a la tercera vez, y entonces no protege nada.

## 8. CI (GitHub Actions)

`ci.yml` detecta qué cambió (doc 06 §5.1) y despacha `service.yml` por cada servicio
afectado:

```yaml
# .github/workflows/service.yml (resumido)
on: { workflow_call: { inputs: { servicio: { type: string, required: true } } } }
jobs:
  verificar:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16, env: { POSTGRES_PASSWORD: test }, ports: ['5432:5432'] }
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run arch
      - run: bun run estructura
      - run: bun run convenciones
      - run: bun test services/${{ inputs.servicio }} packages/shared-kernel tests/contratos
      - run: bunx tsc --noEmit -p services/${{ inputs.servicio }}

  imagen:
    needs: verificar
    if: github.ref == 'refs/heads/main'
    permissions: { id-token: write, contents: read }     # OIDC, sin claves largas
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with: { role-to-assume: ${{ secrets.AWS_ROLE_CI }}, aws-region: us-east-1 }
      - uses: aws-actions/amazon-ecr-login@v2
      - run: docker build -f services/${{ inputs.servicio }}/Dockerfile
                 -t $ECR/edtech/${{ inputs.servicio }}:${{ github.sha }} .
      - run: docker push $ECR/edtech/${{ inputs.servicio }}:${{ github.sha }}

  desplegar-dev:
    needs: imagen
    steps:
      - run: |
          cd infra/envs/dev/services/${{ inputs.servicio }}
          terraform init && terraform apply -auto-approve -var image_tag=${{ github.sha }}

  plan-prod:
    needs: imagen
    steps:
      - run: terraform plan          # solo plan; apply de prod NUNCA es automático (D16)
```

Puntos que no son negociables:

- **OIDC**, no `AWS_ACCESS_KEY_ID` en secrets. Una clave larga en GitHub es una fuga
  esperando ocurrir.
- El rol de CI puede desplegar **`dev` y nada más**. Aplicar `prod` requiere credenciales
  que el pipeline no tiene.
- El tag de imagen es el **SHA del commit**, nunca `latest`. Con `latest` no se sabe qué
  está corriendo ni se puede volver atrás.
- `plan-prod` corre y publica el diff como comentario, pero `apply` es manual y gateado.

## 9. Orden de las verificaciones

Deliberado: lo más rápido primero, para que un error trivial no espere cinco minutos.

```
tsc --noEmit  (segundos)
   → arch-check  (segundos)
      → convenciones  (segundos)
         → estructura  (instantáneo)
            → tests de dominio y aplicación  (segundos)
               → tests de persistencia y mensajería  (~1 min, necesita Postgres)
                  → build de imagen  (~2 min)
                     → despliegue a dev
```
