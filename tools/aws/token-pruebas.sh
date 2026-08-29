#!/usr/bin/env bash
# Access token de un usuario de pruebas del pool de dev, para correr tools/e2e.ts
# contra AWS. Imprime SOLO el token, para poder hacer:
#
#   TOKEN=$(tools/aws/token-pruebas.sh e2e@edtech.test estudiante) \
#   WEB_BASE=https://… API_BASE=https://… bun run tools/e2e.ts
#
# La contraseña se genera al vuelo y se descarta: no se guarda en ningún archivo
# ni queda en el repositorio (D17). El usuario sí queda creado en el pool.
set -euo pipefail

EMAIL="${1:-e2e@edtech.test}"
GRUPO="${2:-estudiante}"
POOL="${COGNITO_POOL_ID:-us-east-1_90p1A5TSM}"
CLIENTE="${COGNITO_CLIENT_PRUEBAS:-sm3r98rg412itpo9pua41i4u8}"

# 24 bytes aleatorios cumplen cualquier política razonable del pool
CLAVE="Aa1!$(openssl rand -base64 24 | tr -d '/+=')"

aws cognito-idp admin-create-user \
  --user-pool-id "$POOL" --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
  --message-action SUPPRESS >/dev/null 2>&1 || true

aws cognito-idp admin-set-user-password \
  --user-pool-id "$POOL" --username "$EMAIL" \
  --password "$CLAVE" --permanent >/dev/null

if [ "$GRUPO" != "" ]; then
  aws cognito-idp admin-add-user-to-group \
    --user-pool-id "$POOL" --username "$EMAIL" --group-name "$GRUPO" >/dev/null 2>&1 || true
fi

aws cognito-idp admin-initiate-auth \
  --user-pool-id "$POOL" --client-id "$CLIENTE" \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="$EMAIL",PASSWORD="$CLAVE" \
  --query 'AuthenticationResult.AccessToken' --output text
