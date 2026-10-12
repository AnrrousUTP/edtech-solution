#!/usr/bin/env bash
set -euo pipefail

domain="${1:-}"
if [[ "$domain" != "affiliates" && "$domain" != "catalog" && "$domain" != "enrollment-progress" && "$domain" != "identity-access" && "$domain" != "flashcards" && "$domain" != "iot-terminals" && "$domain" != "payments" && "$domain" != "outbox" ]]; then
  printf '%s\n' 'Dominios/artefactos soportados: affiliates, catalog, enrollment-progress, identity-access, flashcards, iot-terminals, payments, outbox' >&2
  exit 2
fi

workspace="$(git rev-parse --show-toplevel)"
source_revision="$(git -C "$workspace" rev-parse HEAD)"
if [[ -n "$(git -C "$workspace" status --porcelain)" ]]; then
  source_revision="${source_revision}-dirty"
fi
docker run --rm \
  --mount "type=bind,src=${workspace},dst=/src" \
  --mount "type=volume,src=edtech-bun-cache,dst=/root/.bun/install/cache" \
  --env "SOURCE_REVISION=${source_revision}" \
  --entrypoint sh \
  oven/bun:1.3.14 \
  -c '
    set -eu
    mkdir -p /tmp/edtech-build
    tar -C /src --exclude="./.git" --exclude="./.local" --exclude="./.next" --exclude="*.env" --exclude="*.tfvars" --exclude="*.tfstate*" --exclude="./node_modules" --exclude="*/node_modules" --exclude="*/.terraform" -cf - . | tar -C /tmp/edtech-build -xf -
    cd /tmp/edtech-build
    bun install --frozen-lockfile
    bun run lambda:build "$1"
    mkdir -p "/src/.local/lambda/$1"
    cp ".local/lambda/$1/$1.zip" "/src/.local/lambda/$1/$1.zip"
  ' sh "$domain"
