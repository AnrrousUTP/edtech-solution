# Resultados del piloto local Docker vs. Podman

La prueba se ejecutó únicamente en la distribución Ubuntu WSL2 del entorno
Anrrous Dev. No se ejecutó Terraform ni se tocó AWS.

## Entorno

- WSL2, kernel `6.6.87.2-microsoft-standard-WSL2`, arquitectura x86_64.
- 8 CPU y aproximadamente 3.8 GiB disponibles para el entorno de contenedores.
- Repositorio en `/mnt/d/Work_Developer/Study/edtech-platform`.
- Docker Engine `29.7.2` y Docker Compose `v5.5.0`.
- Podman `5.7.0` y `podman-compose 1.5.0`, rootless.

El repositorio está en el filesystem montado de Windows. Bun mostró
`Slow filesystem detected` durante la construcción de las imágenes; por eso
esta ubicación es una variable de rendimiento relevante en ambos motores.

## Mediciones observadas

| Prueba                                   |                            Docker |                                        Podman | Lectura                                                                                          |
| ---------------------------------------- | --------------------------------: | --------------------------------------------: | ------------------------------------------------------------------------------------------------ |
| `up -d --build` con caché disponible     |         1m06s en la corrida final | 1m26s en la corrida de construcción funcional | Ambos levantaron el stack completo; las cachés no eran equivalentes                              |
| Primera construcción funcional de Podman |                                 — |                                         3m14s | Incluyó construcción de las imágenes del proyecto después de descargar bases                     |
| HTTP web                                 |                               200 |                                           200 | Ambos respondieron correctamente                                                                 |
| HTTP gateway                             |                      200 / 0.086s |                                  200 / 0.118s | Ambos respondieron correctamente                                                                 |
| E2E                                      |                       OK / 5.471s |                          OK / 4.911s y 5.703s | Catálogo, nivelación, matrícula, evaluaciones, eventos, insignias, certificado, flashcards y SSR |
| RAM observada del stack                  | ~810 MB en los servicios visibles |               ~800 MB con `payments` incluido | Sin ahorro apreciable por cambiar solo el motor                                                  |

La medición de Docker reutilizó una caché de BuildKit ya existente. La primera
caché de Podman era independiente y tuvo que descargar las imágenes base; la
comparación de tiempos no representa una prueba científica de rendimiento del
motor. El dato confiable es que ambos motores pueden construir y ejecutar el
stack, mientras que la velocidad de los cambios depende mucho de la caché y del
filesystem del proyecto.

## Ajustes aplicados para Podman

La compatibilidad quedó incorporada en cambios locales y reproducibles:

1. `docker-compose.podman.yml` monta una configuración de Nginx con el
   resolver `10.89.0.1`, que es el DNS de la red rootless de Podman en esta
   instalación WSL2. El Compose base permanece compatible con Docker.
2. `tools/localstack-init/Dockerfile` normaliza el script de inicialización a
   LF y conserva el permiso ejecutable, aunque el repositorio esté montado
   desde Windows con CRLF.
3. El healthcheck de LocalStack valida la creación del secreto de PayPal antes
   de permitir que `payments` arranque.
4. Netavark no pudo aplicar nftables en esta instalación WSL2. El piloto usa
   `firewall_driver = "none"` en la configuración rootless de usuario.
5. `podman compose` delegó en el plugin de Docker Compose y se bloqueó durante
   la construcción paralela. El procedimiento fija `podman-compose` directo.

Con estos ajustes, el E2E pasó en Docker y Podman sin diferencias funcionales.
También se detuvo y volvió a iniciar el stack de Podman; después de esperar la
inicialización de LocalStack, el E2E volvió a pasar y los datos persistieron.

## Prueba de desarrollo con watch

Se levantó una instancia de `catalog` con `bun run --watch`, montando `src`
desde el repositorio y sin reconstruir la imagen. El servicio inició y
respondió por HTTP, pero el cambio de una respuesta de `/health` no fue
detectado mientras el código estaba en `/mnt/d`. El archivo modificado sí era
visible dentro del contenedor; el proceso no se reinició porque el filesystem
montado de Windows no entregó el evento esperado por Bun.

Este resultado es reproducible y fija la condición para el desarrollo rápido:
el repositorio debe moverse a una ruta Linux dentro de WSL2, por ejemplo
`~/dev/edtech-platform`, o el watcher debe configurarse con polling. Podman no
elimina esa limitación del filesystem compartido.

## Diagnóstico

Podman es viable para este proyecto en WSL2 con el override incluido. El
Compose base conserva el flujo de Docker y el archivo adicional resuelve el
DNS rootless del gateway. El empaquetado de LocalStack y su healthcheck eliminan
los fallos de arranque que aparecieron en la primera corrida.

El cambio de motor por sí solo no ataca el cuello de botella principal: la
imagen web ejecuta `next build`, que en la línea base de Docker tomó alrededor
de 105s. Además, cada cambio reconstruye varias imágenes y lee el contexto
desde `/mnt/d`. Para acelerar el desarrollo diario, el mayor beneficio vendrá
de un Compose de desarrollo con `next dev`/`bun run --watch`, cachés persistentes
y el repositorio dentro del filesystem Linux de WSL2.

## Recomendación para la migración local

La migración local a Podman queda aprobada para el stack actual. El comando
reproducible es:

```bash
podman-compose -f docker-compose.yml -f docker-compose.podman.yml \
  --profile full up -d --build
```

Para validar una instalación nueva, ejecutar después `bun run tools/e2e.ts`
desde el entorno que tenga Bun disponible. En esta laptop, Bun está instalado
en Windows y el E2E se ejecutó desde PowerShell contra los puertos expuestos
por WSL2.

El cambio de motor no produjo un ahorro apreciable de RAM por sí solo. Para
mejorar el tiempo de ver los cambios, el siguiente trabajo recomendado es un
perfil de desarrollo con `next dev`/`bun run --watch`, dependencias persistentes
y el repositorio dentro del filesystem Linux de WSL2. El perfil `full` debe
reservarse para E2E y validaciones integrales. La prueba en `/mnt/d` no debe
usarse como criterio de rendimiento del watcher porque el filesystem impide
que el cambio llegue al proceso sin polling.

No se requiere ajustar Terraform ni la configuración de AWS por esta
migración local: las imágenes siguen siendo OCI y AWS se continúa gestionando
por separado, como se definió para este piloto.

No hay evidencia en esta prueba de un ahorro importante de RAM al tener ambos
motores instalados. Si se usa Podman, Docker Engine debe dejar de ejecutarse en
la distribución para que el cambio produzca un ahorro real de recursos.
