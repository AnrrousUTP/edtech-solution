# Piloto local Docker vs. Podman

Esta prueba mide únicamente el impacto local del cambio de Docker a Podman. No
ejecuta Terraform, no publica imágenes en ECR y no modifica AWS.

## Objetivo

Comparar tres escenarios sobre el mismo commit:

1. Docker con el flujo actual del repositorio.
2. Podman con el mismo `docker-compose.yml` y los mismos Dockerfiles.
3. Podman con un flujo local de desarrollo que evita reconstruir imágenes para
   cada cambio de código.

El escenario 2 mide el efecto del motor. El escenario 3 mide el efecto del
flujo de desarrollo.

## Condiciones de la prueba

- Usar la misma máquina, rama, commit, versión de Bun y conexión de red.
- Registrar CPU, RAM, versión de Windows y espacio libre en disco.
- Ejecutar cada medición tres veces y conservar la mediana.
- Hacer una ejecución inicial de calentamiento para descargar imágenes y crear
  cachés.
- No usar `system prune` durante la medición; elimina cachés y altera la
  comparación.
- Si Docker y Podman se prueban en momentos distintos, reiniciar el equipo o
  dejar documentado el estado de caché.

## Escenario A: Docker actual

Medir el arranque completo:

```powershell
docker compose --profile full down

$inicio = Get-Date
docker compose --profile full up -d --build
$fin = Get-Date

"arranque_total=$($fin - $inicio)"
bun run tools/e2e.ts
docker stats --no-stream
docker system df
```

Medir una modificación en un servicio:

```powershell
$inicio = Get-Date
docker compose build catalog
docker compose up -d catalog
$fin = Get-Date

"cambio_catalog=$($fin - $inicio)"
```

Repetir el mismo procedimiento con `web`, porque su imagen ejecuta el build de
Next.js y representa el caso más costoso.

## Escenario B: Podman con el flujo actual

En WSL2 no se usa `podman machine`. Preparar Podman una sola vez dentro de la
distribución Ubuntu de Anrrous Dev:

```bash
sudo apt-get update
sudo apt-get install -y podman podman-compose
mkdir -p ~/.config/containers
cat > ~/.config/containers/containers.conf <<'EOF'
[network]
firewall_driver = "none"
EOF
podman info
```

Ejecutar los mismos pasos, cambiando únicamente el comando del motor:

```bash
podman-compose -f docker-compose.yml -f docker-compose.podman.yml --profile full down
time podman-compose -f docker-compose.yml -f docker-compose.podman.yml --profile full up -d --build
bun run tools/e2e.ts
podman stats --no-stream
podman system df
```

El override `docker-compose.podman.yml` adapta únicamente el DNS rootless del
gateway. El Compose base empaqueta el script de LocalStack en una imagen y
espera a que el secreto local exista antes de iniciar `payments`.

Repetir también el build de `catalog` y `web`. Usar `podman-compose` directo;
en esta instalación, `podman compose` delega en el plugin de Docker Compose y
esa ruta se bloqueó durante la construcción paralela.

## Escenario C: Podman con desarrollo rápido

Este escenario debe mantener PostgreSQL, LocalStack, JWT y el gateway en
contenedores, pero ejecutar el código en modo watch. Puede implementarse con
un Compose temporal o ejecutando Bun desde el host.

El objetivo es que:

- Los servicios usen `bun run --watch`.
- La web use `next dev`.
- El código fuente se monte como volumen si el proceso corre dentro del
  contenedor.
- Las dependencias permanezcan en un volumen separado para no mezclarse con
  `node_modules` de Windows.
- Un cambio de código no ejecute `bun install` ni reconstruya la imagen.

Medir el tiempo desde que se guarda un cambio hasta que la respuesta o la
pantalla refleja el cambio. Repetirlo para `catalog` y `web`.

## Métricas

| Métrica                             | Docker actual | Podman igual | Podman desarrollo |
| ----------------------------------- | ------------: | -----------: | ----------------: |
| Arranque completo en frío           |               |              |                   |
| Arranque con caché                  |               |              |                   |
| Build de `catalog`                  |               |              |                   |
| Build de `web`                      |               |              |                   |
| Tiempo para ver cambio en `catalog` |               |              |                   |
| Tiempo para ver cambio en `web`     |               |              |                   |
| RAM en reposo                       |               |              |                   |
| RAM con todo levantado              |               |              |                   |
| CPU durante build                   |               |              |                   |
| Espacio usado por imágenes          |               |              |                   |
| Resultado de E2E                    |               |              |                   |

Para los builds, medir también el tamaño del contexto enviado. Antes de
concluir que el motor es lento, repetir la prueba después de crear un
`.dockerignore`/`.containerignore` temporal que excluya `node_modules`, `.git`,
`.next`, `coverage`, `dist` y estados de Terraform.

## Criterios de decisión

Podman será aceptable como reemplazo local si:

- El E2E pasa sin diferencias funcionales.
- Los perfiles, montajes, healthchecks y nombres DNS funcionan.
- El tiempo de build no empeora más de 15 % frente a Docker.
- El consumo de RAM en reposo o durante la ejecución disminuye de forma
  apreciable, o se elimina un costo/licencia relevante.

El escenario C debe considerarse exitoso si reduce al menos 50 % el tiempo de
cambio a pantalla o endpoint frente al flujo actual, aunque el tiempo de build
completo sea similar.

## Interpretación

- Si B mejora a A, Podman aporta una mejora propia del motor.
- Si B es similar a A pero C es mucho más rápido, el problema principal era el
  flujo sin hot reload.
- Si B es más lento en Windows y C mejora mucho, conviene adoptar el modo de
  desarrollo rápido y decidir el motor por consumo, licencia y estabilidad.
- Si todos los escenarios son lentos, la prioridad es optimizar el contexto de
  build, los cachés y el número de servicios levantados.

## Resultado esperado

La hipótesis inicial es que Podman puede reducir parte del consumo del motor,
pero la mejora más grande vendrá de no reconstruir las siete imágenes para cada
cambio. El perfil `full` debe reservarse para E2E; el desarrollo diario debería
usar solo las dependencias necesarias y procesos con watch.
