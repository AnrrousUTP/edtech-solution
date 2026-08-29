#!/usr/bin/env bash
# Pausa nocturna de dev (doc 16 §4). Baja todas las tareas a 0; Aurora se pausa
# sola porque el clúster tiene min_capacity = 0.
#
#   tools/aws/pausar-dev.sh          # pausar
#   tools/aws/pausar-dev.sh 1        # reactivar
#
# Un procedimiento de apagado que nadie ejecutó nunca falla justo cuando se
# necesita: este se probó en F12, ida y vuelta, midiendo el tiempo.
set -euo pipefail

CUENTA="${DESIRED_COUNT:-${1:-0}}"
CLUSTER="${ECS_CLUSTER:-edtech-dev-cluster}"
SERVICIOS="identity-access catalog enrollment-progress gamification flashcards payments web"

echo "== poniendo desired-count = $CUENTA en $CLUSTER =="
for s in $SERVICIOS; do
  aws ecs update-service \
    --cluster "$CLUSTER" --service "edtech-dev-svc-$s" \
    --desired-count "$CUENTA" --query 'service.serviceName' --output text
done

echo
echo "== esperando a que converjan =="
for _ in $(seq 1 40); do
  pendientes=0
  for s in $SERVICIOS; do
    corriendo=$(aws ecs describe-services --cluster "$CLUSTER" \
      --services "edtech-dev-svc-$s" --query 'services[0].runningCount' --output text)
    [ "$corriendo" != "$CUENTA" ] && pendientes=$((pendientes + 1))
  done
  [ "$pendientes" -eq 0 ] && { echo "listo: los 7 servicios en $CUENTA"; break; }
  echo "  faltan $pendientes"
  sleep 15
done

if [ "$CUENTA" = "0" ]; then
  cat <<'NOTA'

Aurora se pausa sola a los 5 minutos sin conexiones (min_capacity = 0).
Lo que sigue costando: NAT Gateway, ALB, el bucket de state, las imagenes de
ECR y S3. Para bajar tambien eso hace falta el apagado profundo del doc 16 §4.

Reactivar: tools/aws/pausar-dev.sh 1
NOTA
fi
