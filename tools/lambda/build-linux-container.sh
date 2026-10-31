#!/usr/bin/env bash
set -euo pipefail

domains="${1:-}"
if [[ "$domains" == "all" ]]; then
  domains="affiliates catalog enrollment-progress identity-access flashcards gamification iot-terminals payments outbox"
elif [[ "$domains" != "affiliates" && "$domains" != "catalog" && "$domains" != "enrollment-progress" && "$domains" != "identity-access" && "$domains" != "flashcards" && "$domains" != "gamification" && "$domains" != "iot-terminals" && "$domains" != "payments" && "$domains" != "outbox" ]]; then
  printf '%s\n' 'Usa "all" o un dominio: affiliates, catalog, enrollment-progress, identity-access, flashcards, gamification, iot-terminals, payments, outbox' >&2
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
  --env "BUILD_DOMAINS=${domains}" \
  --entrypoint sh \
  oven/bun:1.3.14 \
  -c '
    set -eu
    mkdir -p /tmp/edtech-build
    tar -C /src --exclude="./.git" --exclude="./.local" --exclude="./.next" --exclude="*/.next" --exclude="./study-video-temp" --exclude="./study-video-temptranscript-*.srt" --exclude="./tmp" --exclude="./.env" --exclude="./.env.*" --exclude="*.env" --exclude="*.tfvars" --exclude="*.tfstate*" --exclude="./.aws" --exclude="./.ssh" --exclude="./.npmrc" --exclude="./.netrc" --exclude="./CREDENCIALES-PAYPAL.md" --exclude="*.pem" --exclude="*.key" --exclude="*.p12" --exclude="./node_modules" --exclude="*/node_modules" --exclude="*/.terraform" -cf - . | tar -C /tmp/edtech-build -xf -
    cd /tmp/edtech-build
    bun install --frozen-lockfile
    for domain in $BUILD_DOMAINS; do
      bun run lambda:build "$domain"
      mkdir -p "/src/.local/lambda/$domain"
      cp ".local/lambda/$domain/$domain.zip" "/src/.local/lambda/$domain/$domain.zip"
    done
  ' sh
