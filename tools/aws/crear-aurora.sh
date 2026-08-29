#!/bin/bash
# Crea el clúster Aurora de dev con Express Configuration (A-08).
# La cuenta es FREE plan: RDS solo permite Aurora vía --with-express-configuration,
# que fuerza: fuera de VPC (Internet Access Gateway), IAM DB auth exclusiva (sin
# contraseñas), master "postgres", sin Data API, cifrado sse-rds. El provider de
# Terraform no soporta ese parámetro, así que el clúster se crea acá y Terraform
# gestiona el resto (secretos, permisos IAM) leyéndolo como data source.
# Idempotente: si el clúster ya existe, no hace nada.
set -euo pipefail

CLUSTER=edtech-dev-aurora
REGION=us-east-1

if aws rds describe-db-clusters --db-cluster-identifier "$CLUSTER" --region $REGION >/dev/null 2>&1; then
  echo "El clúster $CLUSTER ya existe."
else
  aws rds create-db-cluster \
    --region $REGION \
    --db-cluster-identifier "$CLUSTER" \
    --engine aurora-postgresql \
    --with-express-configuration \
    --serverless-v2-scaling-configuration MinCapacity=0,MaxCapacity=2,SecondsUntilAutoPause=300 \
    --tags Key=Project,Value=edtech Key=Env,Value=dev Key=Service,Value=shared Key=ManagedBy,Value=cli \
    --query 'DBCluster.Status' --output text
fi

echo "Esperando a que $CLUSTER esté disponible..."
for _ in $(seq 1 60); do
  ST=$(aws rds describe-db-clusters --db-cluster-identifier "$CLUSTER" --region $REGION \
    --query 'DBClusters[0].Status' --output text)
  [ "$ST" = "available" ] && break
  sleep 10
done

HOST=$(aws rds describe-db-clusters --db-cluster-identifier "$CLUSTER" --region $REGION \
  --query 'DBClusters[0].Endpoint' --output text)
echo "Endpoint: $HOST"

# La base edtech no se puede crear en el create (limitación de express config)
TOKEN=$(aws rds generate-db-auth-token --hostname "$HOST" --port 5432 --username postgres --region $REGION)
docker run --rm -e PGPASSWORD="$TOKEN" postgres:16-alpine \
  psql "host=$HOST port=5432 user=postgres dbname=postgres sslmode=require" \
  -tc "SELECT 1 FROM pg_database WHERE datname = 'edtech'" | grep -q 1 ||
  docker run --rm -e PGPASSWORD="$TOKEN" postgres:16-alpine \
    psql "host=$HOST port=5432 user=postgres dbname=postgres sslmode=require" \
    -c "CREATE DATABASE edtech"

echo "Listo: $CLUSTER con base edtech."
