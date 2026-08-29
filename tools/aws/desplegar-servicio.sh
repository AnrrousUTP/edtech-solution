#!/usr/bin/env bash
# Despliegue de UN servicio a dev: imagen a ECR con el SHA del commit como tag y
# `terraform apply` de su state propio (doc 06 §5.3). El mismo camino que usará
# service.yml en F12: si algo falla acá, falla igual en CI.
#
#   tools/aws/desplegar-servicio.sh catalog
#   tools/aws/desplegar-servicio.sh web            # el frontend vive en apps/web
#
# Con TAG=<algo> se puede forzar el tag; por defecto es el SHA corto del HEAD.
set -euo pipefail

SERVICIO="${1:?uso: desplegar-servicio.sh <servicio>}"
REGION="${AWS_REGION:-us-east-1}"
CUENTA="$(aws sts get-caller-identity --query Account --output text)"
REGISTRO="${CUENTA}.dkr.ecr.${REGION}.amazonaws.com"
TAG="${TAG:-$(git rev-parse --short HEAD)}"

if [ "$SERVICIO" = "web" ]; then
  RAIZ="apps/web"
else
  RAIZ="services/${SERVICIO}"
fi

[ -d "$RAIZ" ] || { echo "no existe $RAIZ"; exit 1; }

echo "== $SERVICIO :: $TAG =="

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRO"

# El contexto es la raíz del monorepo también para el frontend: su Dockerfile
# copia solo apps/web, pero el path que usa arranca en la raíz (A-40).
docker build -f "${RAIZ}/Dockerfile" -t "${REGISTRO}/edtech/${SERVICIO}:${TAG}" .
docker push "${REGISTRO}/edtech/${SERVICIO}:${TAG}"

cd "${RAIZ}/infra"
terraform init -input=false
terraform apply -input=false -auto-approve -var "image_tag=${TAG}"

echo "== $SERVICIO desplegado con $TAG =="
