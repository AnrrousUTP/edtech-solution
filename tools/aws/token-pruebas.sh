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
PERFIL="${AWS_PROFILE:-edtech}"
REGION="${AWS_REGION:-${POOL%%_*}}"
CUENTA_ESPERADA="047600599757"

case "$GRUPO" in
  estudiante|docente|afiliado) ;;
  *) echo "Rol no válido. Usa estudiante, docente o afiliado." >&2; exit 2 ;;
esac

CUENTA_ACTUAL="$(aws sts get-caller-identity --profile "$PERFIL" --query Account --output text)"
if [ "$CUENTA_ACTUAL" != "$CUENTA_ESPERADA" ]; then
  echo "Cuenta AWS inesperada. Se requiere $CUENTA_ESPERADA (perfil $PERFIL)." >&2
  exit 3
fi

# 24 bytes aleatorios cumplen cualquier política razonable del pool
CLAVE="Aa1!$(openssl rand -base64 24 | tr -d '/+=')"

aws cognito-idp admin-create-user \
  --user-pool-id "$POOL" --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
  --message-action SUPPRESS --profile "$PERFIL" --region "$REGION" >/dev/null 2>&1 || true

aws cognito-idp admin-set-user-password \
  --user-pool-id "$POOL" --username "$EMAIL" \
  --password "$CLAVE" --permanent --profile "$PERFIL" --region "$REGION" >/dev/null

GRUPOS_EXISTENTES="$(aws cognito-idp admin-list-groups-for-user \
  --user-pool-id "$POOL" --username "$EMAIL" \
  --query 'Groups[].GroupName' --output text --profile "$PERFIL" --region "$REGION")"
for GRUPO_EXISTENTE in $GRUPOS_EXISTENTES; do
  if [ -n "$GRUPO_EXISTENTE" ] && [ "$GRUPO_EXISTENTE" != "None" ]; then
    case "${GRUPO_EXISTENTE,,}" in
      estudiante|docente|afiliado|admin)
        aws cognito-idp admin-remove-user-from-group \
          --user-pool-id "$POOL" --username "$EMAIL" \
          --group-name "$GRUPO_EXISTENTE" --profile "$PERFIL" --region "$REGION" >/dev/null
        ;;
    esac
  fi
done
aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$POOL" --username "$EMAIL" --group-name "$GRUPO" \
  --profile "$PERFIL" --region "$REGION" >/dev/null

aws cognito-idp admin-initiate-auth \
  --user-pool-id "$POOL" --client-id "$CLIENTE" \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="$EMAIL",PASSWORD="$CLAVE" \
  --query 'AuthenticationResult.AccessToken' --output text \
  --profile "$PERFIL" --region "$REGION"
