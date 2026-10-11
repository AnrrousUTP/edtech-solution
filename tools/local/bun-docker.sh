#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
# Dependencias y ejecución en Linux; no modifica node_modules de Windows.
env_mounts=()
for name in .env .env.local .env.development .env.production .env.test; do
  if [[ -f "$name" ]]; then env_mounts+=(-v "$PWD/tools/local/empty.env:/repo/$name:ro"); fi
done
docker run --rm -v "$PWD:/repo" "${env_mounts[@]}" -v edtech-bun-deps:/repo/node_modules -w /repo \
  oven/bun:1-alpine bun --no-env-file "$@"
