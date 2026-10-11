#!/usr/bin/env bash
# Aplica únicamente las migraciones aditivas del flujo referido en Aurora.
# Ejecutar con AWS_PROFILE=edtech y Docker disponible en WSL.
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
CLUSTER="${AURORA_CLUSTER:-edtech-dev-aurora}"
ACCOUNT="$(aws sts get-caller-identity --profile edtech --region "$REGION" --query Account --output text)"
[ "$ACCOUNT" = "047600599757" ] || { echo "perfil edtech no apunta a la cuenta del proyecto; cancelado" >&2; exit 1; }

HOST="$(aws rds describe-db-clusters --db-cluster-identifier "$CLUSTER" --profile edtech --region "$REGION" --query 'DBClusters[0].Endpoint' --output text)"
aplicar() {
  local usuario="$1" archivo="$2"
  local token
  token="$(aws rds generate-db-auth-token --hostname "$HOST" --port 5432 --username "$usuario" --profile edtech --region "$REGION")"
  docker run --rm -i -e PGPASSWORD="$token" postgres:16-alpine \
    psql "host=$HOST port=5432 user=$usuario dbname=edtech sslmode=require" \
    -v ON_ERROR_STOP=1 -f - < "$archivo"
}

aplicar svc_payments services/payments/migrations/0001_afiliados.sql
aplicar svc_affiliates services/affiliates/migrations/0000_init.sql
aplicar svc_iot_terminals services/iot-terminals/migrations/0000_init.sql
echo "Migraciones de afiliados, pagos referidos y terminales aplicadas en $CLUSTER."
