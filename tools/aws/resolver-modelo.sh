#!/usr/bin/env bash
# Resuelve el model ID de Bedrock POR CLI y escribe infra/envs/dev/ai.tfvars
# (doc 10 §2, D8). El id no se escribe a mano en ningún .tf: se resuelve acá, en
# tiempo de build, porque el catálogo cambia por región y con el tiempo, y porque
# un id correcto pero no habilitado falla en runtime dentro de una Lambda, donde
# nadie lo ve hasta que un admin se queja.
#
#   tools/aws/resolver-modelo.sh
#
# Prefiere un inference profile (us.anthropic.…) sobre el model ID directo: da
# failover entre regiones y mejor disponibilidad bajo carga.
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
SALIDA="${1:-infra/envs/dev/ai.tfvars}"

# Orden de preferencia: el que pide el mega-prompt primero, y de ahí hacia abajo
# por capacidad. Nunca se inventa un id: todos salen del catálogo real.
PREFERENCIAS="claude-sonnet-4-6 claude-sonnet-5 claude-sonnet-4-5 claude-sonnet-4 claude-haiku-4-5"

perfiles=$(aws bedrock list-inference-profiles --region "$REGION" \
  --query 'inferenceProfileSummaries[?status==`ACTIVE`].inferenceProfileId' --output text)

elegido=""
for pref in $PREFERENCIAS; do
  for p in $perfiles; do
    case "$p" in
      us.anthropic.*"$pref"*) elegido="$p"; break 2 ;;
    esac
  done
done

if [ -z "$elegido" ]; then
  echo "No hay ningun inference profile us.anthropic.* activo en $REGION." >&2
  exit 1
fi

# Existir no es lo mismo que estar habilitado en la cuenta: el modelo base del
# perfil tiene que tener el acuerdo aceptado o InvokeModel devuelve error.
base="${elegido#us.}"
autorizacion=$(aws bedrock get-foundation-model-availability \
  --model-id "$base" --region "$REGION" \
  --query 'authorizationStatus' --output text 2>/dev/null || echo DESCONOCIDO)

habilitado=false
[ "$autorizacion" = "AUTHORIZED" ] && habilitado=true

mkdir -p "$(dirname "$SALIDA")"
cat > "$SALIDA" <<EOF
# GENERADO por tools/aws/resolver-modelo.sh — no editar a mano (D8, doc 10 §2).
# Resuelto en $REGION el $(date -u +%Y-%m-%d).
bedrock_model_id = "$elegido"

# El acuerdo del modelo en la consola de Bedrock (Model access) tiene que estar
# aceptado; hasta entonces el Agent no se crea y flashcards sigue con el fake.
habilitar_bedrock = $habilitado
EOF

echo "modelo: $elegido"
echo "autorizado en la cuenta: $autorizacion"
echo "escrito: $SALIDA"

if [ "$habilitado" != true ]; then
  cat >&2 <<'AVISO'

  El modelo existe pero la cuenta NO tiene acceso concedido. Para habilitarlo:
  consola de Bedrock -> Model access -> Modify model access -> marcar los modelos
  de Anthropic -> completar el formulario de caso de uso -> Submit. Es un tramite
  de la cuenta (datos de la empresa y del caso de uso), no algo que resuelva un
  script. Cuando este aprobado, volver a correr este comando: pondra
  habilitar_bedrock = true y `terraform apply` creara el Agent.
AVISO
fi
