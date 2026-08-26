# 13 — Entorno local

> **Regla de oro de esta máquina (D20): el lado que instala `node_modules` es el lado que
> ejecuta.** El proyecto vive en `/mnt/d/Work_Developer/` (disco de Windows, visto por WSL
> a través del traductor 9p). `bun install` y `docker compose` se corren **desde Windows**
> — PowerShell, cmd o Kiro. Desde WSL solo se lee, se busca (`rg`, `fd`) y se edita.

## 1. Por qué esta restricción

`/mnt/d` pasa por 9p y es aproximadamente **10× más lento** para operaciones con muchos
archivos pequeños. Instalar dependencias o correr un watcher desde WSL sobre 9p produce
instalaciones de minutos, watchers que pierden eventos, y binarios compilados para el
sistema equivocado.

| Operación | Dónde |
|---|---|
| `bun install` | **Windows** |
| `bun run dev`, `docker compose up` | **Windows** |
| Editar archivos, `rg`, `fd`, `git` | WSL (con `git-win` para git) |
| Agentes (Claude Code, Codex) | WSL, leyendo y editando; delegando la ejecución a Windows |

Desde WSL, para ejecutar del lado Windows: `cmd-win /c "bun install"` o
`pwsh-win 'bun run dev'`, ejecutados **desde dentro del directorio del proyecto**.

## 2. Composición

```yaml
# docker-compose.yml (resumido)
services:
  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_DB: edtech, POSTGRES_PASSWORD: local }
    ports: ['5432:5432']
    volumes: ['pgdata:/var/lib/postgresql/data',
              './tools/seed/00-schemas.sql:/docker-entrypoint-initdb.d/00-schemas.sql']
    healthcheck: { test: ['CMD-SHELL','pg_isready -U postgres'], interval: 5s }

  localstack:
    image: localstack/localstack:3
    environment: { SERVICES: 'events,sqs,s3,secretsmanager', DEBUG: 0 }
    ports: ['4566:4566']
    volumes: ['./tools/localstack-init:/etc/localstack/init/ready.d']

  jwt-local:                       # sustituto de Cognito (doc 08 §8)
    build: ./tools/jwt-local
    ports: ['4599:4599']

  identity-access:     { build: {context: ., args: {SERVICIO: identity-access}},     ports: ['3001:3000'] }
  catalog:             { build: {context: ., args: {SERVICIO: catalog}},             ports: ['3002:3000'] }
  enrollment-progress: { build: {context: ., args: {SERVICIO: enrollment-progress}}, ports: ['3003:3000'] }
  gamification:        { build: {context: ., args: {SERVICIO: gamification}},        ports: ['3004:3000'] }
  payments:            { build: {context: ., args: {SERVICIO: payments}},            ports: ['3005:3000'] }
  flashcards:          { build: {context: ., args: {SERVICIO: flashcards}},          ports: ['3006:3000'] }

  web:
    build: { context: ., dockerfile: apps/web/Dockerfile }
    ports: ['3000:3000']
    environment: { NEXT_PUBLIC_API_BASE: 'http://localhost:8080' }

  gateway:                          # nginx: reemplaza al ALB, con las MISMAS rutas
    image: nginx:alpine
    ports: ['8080:80']
    volumes: ['./tools/nginx.conf:/etc/nginx/nginx.conf:ro']

volumes: { pgdata: {} }
```

El **`gateway` de nginx** replica las listener rules del ALB (doc 07 §5): `/api/catalog/*`
→ `catalog:3000`, etc. Así el frontend usa **exactamente las mismas URLs** en local y en
AWS, y no hay una capa de "en local es distinto" que después esconda un bug de rutas.

## 3. Inicialización de LocalStack

`tools/localstack-init/ready.d/01-crear-recursos.sh` corre al arrancar y crea el bus, las
colas, las DLQ, las reglas y los buckets — **con los mismos nombres y patrones** que el
Terraform del doc 07:

```bash
awslocal events create-event-bus --name edtech-domain-events
for q in identity enrollment gamification flashcards payments notifications; do
  awslocal sqs create-queue --queue-name edtech-dev-$q-dlq
  awslocal sqs create-queue --queue-name edtech-dev-$q \
    --attributes RedrivePolicy="{\"deadLetterTargetArn\":\"...\",\"maxReceiveCount\":\"5\"}"
done
awslocal events put-rule --event-bus-name edtech-domain-events \
  --name enrollment-desde-payments \
  --event-pattern '{"detail-type":["payments.pago-confirmado.v1","payments.pago-reembolsado.v1"]}'
awslocal events put-targets --event-bus-name edtech-domain-events \
  --rule enrollment-desde-payments --targets 'Id=1,Arn=arn:aws:sqs:...:edtech-dev-enrollment'
awslocal s3 mb s3://edtech-dev-media
awslocal secretsmanager create-secret --name edtech/dev/paypal --secret-string "$PAYPAL_LOCAL_JSON"
```

**El script se genera desde la misma fuente que las reglas de Terraform**
(`tools/eventos.json`), para que no puedan divergir. Reglas de LocalStack escritas a mano
que se desincronizan del Terraform son la forma más eficiente de que "funcionaba en local"
sea mentira.

## 4. Variables de entorno

`.env.example` versionado, `.env` **no** (doc 09 §5):

```
DATABASE_URL=postgres://svc_<servicio>:local@postgres:5432/edtech
AWS_ENDPOINT_URL=http://localstack:4566        # el SDK apunta acá; en AWS no se define
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
EVENT_BUS_NAME=edtech-domain-events
COGNITO_ISSUER=http://jwt-local:4599           # en AWS: el User Pool real
GENERADOR_FLASHCARDS=fake                      # 'bedrock' en AWS (doc 10 §8)
LOG_LEVEL=debug
```

Una sola variable (`AWS_ENDPOINT_URL`) separa local de AWS. El código **no** tiene
`if (esLocal)`: el `.di.ts` inyecta el mismo cliente con distinta configuración. Cada rama
`if (esLocal)` es una porción de código que en producción nunca se ejecutó.

## 5. Arranque

```powershell
# desde Windows, en la carpeta del proyecto
bun install
docker compose up -d postgres localstack jwt-local
bun run db:migrate        # migraciones de los 6 servicios
bun run db:seed           # datos del doc 03 §11
docker compose up
```

Disponible en:

| URL | Qué |
|---|---|
| `http://localhost:3000` | Frontend |
| `http://localhost:8080/api/*` | Gateway (= ALB) |
| `http://localhost:4566` | LocalStack |
| `postgres://localhost:5432/edtech` | Base |

## 6. Recursos: esta máquina es modesta

i5-8250U, 8 GB de RAM, WSL con techo de 4 GB. **Nueve contenedores a la vez no entran
cómodos.**

`docker compose` define perfiles para levantar solo lo necesario:

```bash
docker compose --profile base up          # postgres + localstack + jwt-local
docker compose --profile pagos up         # base + payments + enrollment + web
docker compose --profile contenido up     # base + catalog + flashcards + web
docker compose up                         # todo (para el E2E completo)
```

Con límites por contenedor (`mem_limit: 512m` en los servicios, `1g` en Postgres) y sin
watchers de Bun sobre volúmenes montados desde 9p — el hot reload en desarrollo se hace
corriendo **el servicio que se está tocando fuera de Docker** (`bun run --watch`) contra el
Postgres y el LocalStack del compose. Es la única forma de que el ciclo de edición sea
rápido en esta máquina.

## 7. Lo que el entorno local NO reproduce

Escrito para que nadie confunda "pasa en local" con "funciona":

| Diferencia | Consecuencia | Dónde se prueba de verdad |
|---|---|---|
| LocalStack no tiene Cognito | Federación social, MFA y rotación de refresh no se prueban (R15) | AWS dev, F12 |
| LocalStack no tiene Bedrock | La generación real de flashcards usa un fake (doc 10 §8) | AWS dev, F11 |
| El webhook de PayPal necesita URL pública | En local hace falta ngrok con **dominio estático** y su propio `webhook_id` (doc 09 §6.3). `dev` no lo necesita: apunta al ALB | AWS dev, F8 |
| Sin IAM real | Un permiso faltante no aparece en local: todo pasa con credenciales `test` | AWS dev, F10. **Es la fuente número uno de sorpresas al desplegar** |
| Sin latencia de red ni cold start | Los timeouts parecen holgados y no lo son | AWS dev |
| Postgres local ≠ Aurora Serverless | Sin auto-pause, sin escalado de ACU, sin failover | AWS dev |
| Sin CloudFront ni WAF | CORS, cabeceras y rate limit no se ejercitan | AWS dev, F10 |

La conclusión práctica: **el harness y los tests dan confianza sobre la lógica; solo AWS
`dev` da confianza sobre la infraestructura.** Por eso F10 (primer despliegue real) va lo
antes posible en el plan de fases, y no al final.
