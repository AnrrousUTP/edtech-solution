# EdTech Solution

Plataforma de cursos de programación con progresión por niveles, gamificación y
aprendizaje asistido por IA. Seis servicios con arquitectura hexagonal sobre un
monorepo Bun, comunicados por eventos, desplegados en ECS Fargate.

El plan completo —del que sale cada decisión de este repositorio— está en
[`plataforma_edtech/`](plataforma_edtech/). Los supuestos que hubo que tomar más
allá de ese plan están en [`DECISIONS.md`](DECISIONS.md), y los propios de cada
servicio en su `services/<servicio>/DECISIONS.md`.

## Arranque local

```bash
bun install
docker compose --profile full up -d      # 6 servicios + web + gateway + postgres + localstack
bun run db:seed                          # catálogo de ejemplo, en BORRADOR
bun run tools/seed/publicar-cursos.ts    # publicarlos emite los eventos de verdad
```

| URL                              | Qué                                          |
| -------------------------------- | -------------------------------------------- |
| http://localhost:3000            | Frontend                                     |
| http://localhost:8080/api/\*     | Gateway — replica las listener rules del ALB |
| http://localhost:4566            | LocalStack (EventBridge, SQS, S3, Secrets)   |
| http://localhost:4599            | Emisor JWT local, con la forma de Cognito    |
| postgres://localhost:5432/edtech | Base de datos, un esquema por servicio       |

Perfiles de compose: `base` (infra), `pagos`, `contenido`, `full`. Para entrar sin
Cognito, `http://localhost:3000/api/auth/local?rol=estudiante` (o `rol=admin`)
emite un token local y deja la sesión puesta.

Las migraciones las aplica cada servicio al arrancar; no hay paso aparte.

## Verificación

```bash
bun run harness              # arch-check + estructura + convenciones + tests
bun run tools/e2e.ts         # flujo completo del doc 00 §DoD contra el stack local
```

`harness` es la condición para avanzar: si está en rojo, no se sigue. El
`arch-check` tiene su propio test negativo (`tools/arch-check.test.ts`), que
genera código malo a propósito y comprueba que las reglas lo rechazan — una regla
que nunca falló no demuestra nada.

Contra AWS `dev`:

```bash
TOKEN=$(tools/aws/token-pruebas.sh e2e@edtech.test estudiante) \
WEB_BASE=https://<borde> API_BASE=https://<borde> \
bun run tools/e2e.ts

bun run tools/verificar-cierre.ts   # el checklist del doc 15 §3, por comando
```

## Despliegue

La infra está partida por **state**, no por entorno: cada módulo compartido y cada
servicio tienen el suyo, así que desplegar uno no puede tocar a otro.

```
infra/envs/dev/{network,security,database,messaging,storage,registry,
                compute-base,cognito,observability,edge,ai,ci}/
services/<servicio>/infra/        # uno por servicio
apps/web/infra/
```

Orden la primera vez (los de arriba son dependencia de los de abajo):

```bash
# 1. Base compartida
for m in network security database messaging storage registry compute-base cognito observability edge; do
  (cd infra/envs/dev/$m && terraform init && terraform apply)
done

# 2. Aurora se crea aparte: la cuenta FREE solo admite Express Configuration (A-08)
tools/aws/crear-aurora.sh
tools/aws/bootstrap-db.sh       # 6 esquemas, 6 roles IAM, sin GRANT cruzado

# 3. Un servicio
tools/aws/desplegar-servicio.sh catalog     # build + push con el SHA + terraform apply
```

En CI eso mismo lo hace [`.github/workflows/service.yml`](.github/workflows/service.yml),
despachado por [`ci.yml`](.github/workflows/ci.yml) solo para lo que cambió. El
pipeline entra por **OIDC** (`edtech-dev-ci`), sin ninguna clave larga en los
secrets del repositorio, y puede desplegar `dev` y nada más: `prod` exige
credenciales que el pipeline no tiene.

El tag de la imagen es siempre el **SHA del commit**, nunca `latest`: con `latest`
no se sabe qué está corriendo ni se puede volver atrás.

### Costos y apagado

```bash
tools/aws/pausar-dev.sh      # todas las tareas a 0
tools/aws/pausar-dev.sh 1    # de vuelta
```

Probado de ida y vuelta: pausar tarda ~40 s, reactivar ~80 s y el tráfico vuelve
enseguida. Aurora se pausa sola a los 5 minutos sin conexiones. El detalle de
costos medidos contra la estimación del doc 16 está en [`CIERRE.md`](CIERRE.md).

## Mapa del repositorio

```
packages/shared-kernel/   Result, eventos, poller SQS, middlewares HTTP, X-Ray
services/<servicio>/      domain → application → infrastructure (doc 04 §10)
apps/web/                 Next.js 15, App Router, Server Components por defecto
infra/modules/            network, security, database, messaging, storage, registry,
                          compute-base, service, cognito, observability, edge, ai
tools/                    harness, generadores, guiones de AWS, E2E, cierre
plataforma_edtech/        el plan (docs 00–17)
```

Cada servicio publica además su `events-catalog.md` (qué emite y qué consume) y su
`openapi.yaml`.
