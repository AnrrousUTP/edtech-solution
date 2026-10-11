#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
env_files=()
if [[ -f .env ]]; then env_files+=(--env-file .env); fi
env_files+=(--env-file tools/local/anrrous-dev.env)
compose=(docker compose "${env_files[@]}" -f docker-compose.yml -f docker-compose.anrrous-dev.yml -f docker-compose.afiliados.yml --profile full --profile afiliados-iot)
case "${1:-up}" in
  up)
    bash tools/local/bun-docker.sh install --ignore-scripts
    bash tools/local/bun-docker.sh run gen:localstack
    "${compose[@]}" config --quiet
    COMPOSE_PARALLEL_LIMIT=1 "${compose[@]}" up -d --build
    "${compose[@]}" ps
    ;;
  status) "${compose[@]}" ps ;;
  start) "${compose[@]}" up -d --no-build ;;
  refresh) "${compose[@]}" up -d --build payments affiliates iot-terminals terminal-simulator ;;
  stop) "${compose[@]}" stop ;;
  seed)
    "${compose[@]}" run --rm --build afiliados-tools bun run tools/seed/index.ts
    "${compose[@]}" run --rm afiliados-tools bun run tools/local/publicar-demo-afiliados.ts
    ;;
  test) "${compose[@]}" run --rm --build afiliados-tools bun run tools/e2e-afiliados.ts ;;
  demo) "${compose[@]}" run --rm --build afiliados-tools bun run tools/local/demo-afiliados.ts ;;
  reconnect-test)
    mkdir -p .local
    "${compose[@]}" build afiliados-tools
    "${compose[@]}" stop terminal-simulator
    restart_terminal() { "${compose[@]}" start terminal-simulator; }
    trap restart_terminal EXIT
    "${compose[@]}" run --rm -v "$PWD/.local:/repo/.local" afiliados-tools bun tools/local/test-reconexion-afiliados.ts offline
    "${compose[@]}" start terminal-simulator
    "${compose[@]}" run --rm -v "$PWD/.local:/repo/.local" afiliados-tools bun tools/local/test-reconexion-afiliados.ts online
    trap - EXIT
    ;;
  *) echo 'Uso: bash tools/local/afiliados.sh [up|start|status|stop|seed|test|demo|refresh]'; exit 2 ;;
esac
