# EdTech Solution

Plataforma de cursos de programación con progresión por niveles, gamificación y
aprendizaje asistido por IA. Seis servicios con arquitectura hexagonal sobre un
monorepo Bun, comunicados por eventos, desplegados en ECS Fargate.

El plan completo —del que sale cada decisión de este repositorio— está en
[`plataforma_edtech/`](plataforma_edtech/). Los supuestos que hubo que tomar más
allá de ese plan están en [`DECISIONS.md`](DECISIONS.md), y los propios de cada
servicio en su `services/<servicio>/DECISIONS.md`.

## Arranque local

### Docker

```bash
docker compose --profile full up -d --build # 6 servicios + web + gateway + postgres + localstack
```

### Podman en Ubuntu sobre WSL2

El flujo con Podman está probado en Ubuntu ejecutado sobre WSL2. No se necesita
Docker Desktop ni Podman Desktop. Clona el repositorio dentro del filesystem de
Ubuntu, por ejemplo `~/dev/edtech-platform`; evita trabajar desde `/mnt/c` o
`/mnt/d`, porque el filesystem montado de Windows puede impedir que Bun detecte
los cambios en modo watch.

Instala Podman y configura la red rootless una sola vez dentro de Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y podman podman-compose
mkdir -p ~/.config/containers
cat > ~/.config/containers/containers.conf <<'EOF'
[network]
firewall_driver = "none"
EOF
```

Desde la raíz del repositorio, levanta el stack con el override específico para
Podman:

```bash
podman-compose \
  -f docker-compose.yml \
  -f docker-compose.podman.yml \
  --profile full up -d --build
```

Para detenerlo:

```bash
podman-compose \
  -f docker-compose.yml \
  -f docker-compose.podman.yml \
  --profile full down
```

Usa `podman-compose` directamente. En el entorno validado, `podman compose`
delegó en el plugin de Docker Compose y se bloqueó durante la construcción.
Ubuntu nativo instalado en una máquina física o una VM todavía requiere una
validación de red independiente; el procedimiento documentado aquí corresponde
a Ubuntu sobre WSL2.

### Ejecutar junto a otros proyectos en Anrrous Dev

Si ya tienes otros contenedores ocupando los puertos habituales, usa el override
con puertos alternos. Este perfil activa una pasarela de pagos local que simula
la aprobación, captura y reembolso sin conectarse a PayPal ni guardar claves:

```bash
set -a
source tools/local/anrrous-dev.env
set +a

podman-compose \
  --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.podman.yml \
  -f docker-compose.anrrous-dev.yml \
  --profile full up -d --build
```

La aplicación queda en `http://localhost:3100` y el gateway en
`http://localhost:8180`. Para detener este stack usa los mismos tres archivos
con `down`, cargando también `tools/local/anrrous-dev.env` y `.env`. El modo
real de PayPal sigue siendo el predeterminado en el Compose base; se activa con
`PAYPAL_MODE=real` y requiere credenciales de Sandbox en Secrets Manager o
LocalStack. Las claves nunca deben hardcodearse en el código.

Para cargar el catálogo de ejemplo (opcional), instala Bun y ejecuta:

```bash
bun install
bun run db:seed                           # catálogo de ejemplo, en BORRADOR
bun run tools/seed/publicar-cursos.ts     # publicarlos emite los eventos de verdad
```

El stack local puede arrancar sin credenciales externas usando los valores por
defecto y el archivo `.env` real está excluido de Git. Para ejecutar el
asistente, el `.env` debe cargarse con `--env-file .env`. En Anrrous Dev no se
debe usar `tools/local/anrrous-dev.env` como único `--env-file`, porque eso
dejaría vacías las claves del asistente; ese archivo solo contiene los puertos
alternos y el modo de PayPal local.

Si se quiere usar el asistente con Docker, las credenciales se pueden definir
antes de levantar la web. Por ejemplo, en Bash:

```bash
OPENAI_API_KEY=<clave-opcional> ELEVENLABS_API_KEY=<clave-opcional> \
  docker compose --profile full up -d --build
```

En PowerShell:

```powershell
$env:OPENAI_API_KEY = '<clave-opcional>'
$env:ELEVENLABS_API_KEY = '<clave-opcional>'
docker compose --profile full up -d --build
```

Las dos claves son independientes: `OPENAI_API_KEY` habilita las respuestas de
texto y `ELEVENLABS_API_KEY` habilita la transcripción de audio. Sin ellas, la
plataforma y el resto de las funciones locales siguen arrancando; únicamente la
función correspondiente del asistente muestra que no está configurada.

Requisitos mínimos: Docker Desktop/Engine con Compose, o Ubuntu sobre WSL2 con
Podman y `podman-compose`. Bun solo es necesario para ejecutar los comandos de
seed y las herramientas de verificación desde el host o desde Ubuntu.
Para detener el entorno:

```bash
docker compose --profile full down
```

| URL                              | Qué                                          |
| -------------------------------- | -------------------------------------------- |
| http://localhost:3000            | Frontend                                     |
| http://localhost:8080/api/\*     | Gateway — replica las listener rules del ALB |
| http://localhost:4566            | LocalStack (EventBridge, SQS, S3, Secrets)   |
| http://localhost:4599            | Emisor JWT local, con la forma de Cognito    |
| postgres://localhost:5432/edtech | Base de datos, un esquema por servicio       |

Perfiles de compose: `base` (infra), `pagos`, `contenido`, `full`. Para entrar sin
Cognito, el perfil `full` activa `EDTECH_LOCAL_AUTH=true` y
`http://localhost:3000/api/auth/local?rol=estudiante` (o `rol=admin`)
emite un token local y deja la sesión puesta. Esa bandera debe omitirse en AWS.

La web también expone `/login`, `/register`, `/recuperar` y `/admin/login`. Si
`COGNITO_DOMINIO` y `COGNITO_CLIENT_ID` están configurados, estas pantallas usan
el Hosted UI de Cognito con PKCE. Si no lo están y `EDTECH_LOCAL_AUTH=true`, usan
`jwt-local` para probar
registro, confirmación, login y recuperación sin Terraform. En desarrollo, los
códigos de confirmación y recuperación son `123456` y `654321`.

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
