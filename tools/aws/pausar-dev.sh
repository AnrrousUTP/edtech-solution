#!/usr/bin/env bash
# Pausa/reinicio de tareas ECS de dev.
# En este momento NAT y ALB están deshabilitados: reactivar ECS exige restaurar
# red, balanceador y las diez reglas de listener con Terraform primero, además
# de habilitar explícitamente la regla de telemetría IoT.
#
#   tools/aws/pausar-dev.sh          # pausar
#   tools/aws/pausar-dev.sh 1        # reactivar
#
set -euo pipefail

CUENTA="${DESIRED_COUNT:-${1:-0}}"
CLUSTER="${ECS_CLUSTER:-edtech-dev-cluster}"
PERFIL="edtech"
REGION="us-east-1"
SERVICIOS="identity-access catalog enrollment-progress gamification flashcards payments web affiliates iot-terminals terminal-simulator"

IDENTIDAD=$(aws sts get-caller-identity --profile "$PERFIL" --region "$REGION" \
  --query Account --output text)
[ "$IDENTIDAD" = "047600599757" ] || { echo "perfil edtech no apunta a la cuenta del proyecto; cancelado" >&2; exit 1; }

if [ "$CUENTA" != "0" ]; then
  NAT=$(aws ec2 describe-nat-gateways --filter Name=tag:Name,Values=edtech-dev-nat \
    --profile "$PERFIL" --region "$REGION" --query 'NatGateways[?State==`available`].NatGatewayId | [0]' --output text)
  ALB=$(aws elbv2 describe-load-balancers \
    --profile "$PERFIL" --region "$REGION" \
    --query "LoadBalancers[?LoadBalancerName=='edtech-dev-alb'] | [0].LoadBalancerArn" --output text)
  [ "$NAT" != "None" ] && [ "$ALB" != "None" ] || {
    echo "NAT/ALB están retirados; restaure la red y las reglas ECS con Terraform antes de encender tareas." >&2
    exit 1
  }
  LISTENER=$(aws elbv2 describe-listeners --load-balancer-arn "$ALB" \
    --profile "$PERFIL" --region "$REGION" --query 'Listeners[?Port==`80`].ListenerArn | [0]' --output text)
  [ "$LISTENER" != "None" ] || {
    echo "No existe listener HTTP/80; revise el estado compute-base antes de encender tareas." >&2
    exit 1
  }
  REGLAS=$(aws elbv2 describe-rules --listener-arn "$LISTENER" \
    --profile "$PERFIL" --region "$REGION" --query 'length(Rules[?IsDefault==`false`])' --output text)
  [ "$REGLAS" -ge 10 ] || {
    echo "Faltan las diez reglas de listener de los servicios; aplique y revise sus estados Terraform antes de encender tareas." >&2
    exit 1
  }
  IOT_DESHABILITADA=$(aws iot get-topic-rule --rule-name edtech_dev_terminal_telemetry \
    --profile "$PERFIL" --region "$REGION" --query 'rule.ruleDisabled' --output text)
  [ "${IOT_DESHABILITADA,,}" = "false" ] || {
    echo "La regla IoT de telemetría sigue deshabilitada; habilítela explícitamente en Terraform antes de encender la demo." >&2
    exit 1
  }
fi

echo "== poniendo desired-count = $CUENTA en $CLUSTER =="
for s in $SERVICIOS; do
  aws ecs update-service \
    --cluster "$CLUSTER" --service "edtech-dev-svc-$s" \
    --desired-count "$CUENTA" --profile "$PERFIL" --region "$REGION" \
    --query 'service.serviceName' --output text
done

echo
echo "== esperando a que converjan =="
for _ in $(seq 1 40); do
  pendientes=0
  for s in $SERVICIOS; do
    corriendo=$(aws ecs describe-services --cluster "$CLUSTER" \
      --services "edtech-dev-svc-$s" --profile "$PERFIL" --region "$REGION" \
      --query 'services[0].runningCount' --output text)
    [ "$corriendo" != "$CUENTA" ] && pendientes=$((pendientes + 1))
  done
  [ "$pendientes" -eq 0 ] && { echo "listo: los 10 servicios en $CUENTA"; break; }
  echo "  faltan $pendientes"
  sleep 15
done

if [ "$CUENTA" = "0" ]; then
  cat <<'NOTA'

Aurora puede pausar el cómputo tras 5 minutos sin conexiones (min_capacity = 0);
el almacenamiento de datos sigue existiendo. Revisar Cost Explorer para otros
recursos de almacenamiento que permanezcan activos.

NAT y ALB están retirados. El comando con 1 comprueba red, diez rutas y la regla
IoT antes de encender tareas; no aprovisiona recursos.
NOTA
fi
