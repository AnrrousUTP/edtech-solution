#!/bin/bash
# Bootstrap de schemas y roles en Aurora dev (doc 03 §1, adaptado a A-08):
# los roles NO tienen contraseña — usan IAM DB auth (GRANT rds_iam).
# Idempotente: se puede correr las veces que haga falta.
set -euo pipefail

CLUSTER=edtech-dev-aurora
REGION=us-east-1

HOST=$(aws rds describe-db-clusters --db-cluster-identifier "$CLUSTER" --region $REGION \
  --query 'DBClusters[0].Endpoint' --output text)
TOKEN=$(aws rds generate-db-auth-token --hostname "$HOST" --port 5432 --username postgres --region $REGION)

docker run --rm -i -e PGPASSWORD="$TOKEN" postgres:16-alpine \
  psql "host=$HOST port=5432 user=postgres dbname=edtech sslmode=require" -v ON_ERROR_STOP=1 <<'SQL'
REVOKE ALL ON DATABASE edtech FROM PUBLIC;

DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['identity','catalog','enrollment','gamification','flashcards','payments'] LOOP
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', s);
    BEGIN
      EXECUTE format('CREATE ROLE %I LOGIN', 'svc_' || s);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    -- IAM DB auth: sin contraseña; el token IAM es la credencial (A-08)
    EXECUTE format('GRANT rds_iam TO %I', 'svc_' || s);
    EXECUTE format('GRANT USAGE, CREATE ON SCHEMA %I TO %I', s, 'svc_' || s);
    EXECUTE format('ALTER ROLE %I SET search_path = %I, public', 'svc_' || s, s);
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', s);
    EXECUTE format('GRANT CONNECT ON DATABASE edtech TO %I', 'svc_' || s);
  END LOOP;
END $$;
SQL

echo "Bootstrap OK: 6 schemas + 6 roles IAM en $HOST"
