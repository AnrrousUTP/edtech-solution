# Módulo ai/ (doc 10 §3): Bedrock Agent + action group + Lambda.
#
# Observación honesta, la misma que pide el doc 10 §3: para ESTE caso de uso
# —una sola llamada, prompt fijo, salida JSON, sin herramientas ni conversación—
# un `InvokeModel` directo sería más simple, más barato y más fácil de probar.
# El Agent aporta cuando hay varias herramientas, memoria de sesión o
# razonamiento en varios pasos. Se construye porque está pedido y porque deja
# lista la infraestructura para el tutor conversacional (doc 15, deuda).
# `GeneradorFlashcardsPort` hace que cambiar de uno a otro sea una clase.
#
# Todo cuelga de `habilitar_bedrock`: mientras la cuenta no tenga el acuerdo del
# modelo aceptado (A-46), el módulo aplica en vacío y flashcards sigue con el
# generador fake. Es el mismo patrón de guarda que `habilitar_cloudfront` (A-34).

variable "entorno" { type = string }
variable "bedrock_model_id" {
  description = "Resuelto por tools/aws/resolver-modelo.sh — nunca literal (D8)"
  type        = string
}
variable "habilitar_bedrock" {
  description = "false mientras la cuenta no tenga acceso al modelo; el resto de dev no se entera"
  type        = bool
  default     = false
}
variable "bucket_media_arn" {
  description = "El agente lee el contenido de las lecciones de S3, la misma fuente que el worker (doc 02 §7.3)"
  type        = string
}
variable "sns_alertas_arn" { type = string }

locals {
  prefijo = "edtech-${var.entorno}"
  activo  = var.habilitar_bedrock ? 1 : 0
}

# --------------------------------------------------------------- Lambda del action group

data "archive_file" "action_group" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  output_path = "${path.module}/.terraform-lambda-action-group.zip"
}

resource "aws_iam_role" "lambda" {
  count = local.activo
  name  = "${local.prefijo}-lambda-action-group"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "lambda" {
  count = local.activo
  name  = "permisos-minimos"
  role  = aws_iam_role.lambda[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        # Solo lectura, y solo del prefijo de contenido: ni escribe ni ve nada más
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = ["${var.bucket_media_arn}/contenido/*"]
      },
    ]
  })
}

resource "aws_lambda_function" "action_group" {
  count            = local.activo
  function_name    = "${local.prefijo}-flashcards-action-group"
  role             = aws_iam_role.lambda[0].arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  timeout          = 30
  memory_size      = 256
  filename         = data.archive_file.action_group.output_path
  source_code_hash = data.archive_file.action_group.output_base64sha256

  # Sin vpc_config a propósito: solo habla con S3 por la API pública, así que
  # meterla en la VPC solo agregaría ENIs y dependencia del NAT (doc 07 §9).
}

resource "aws_lambda_permission" "bedrock" {
  count         = local.activo
  statement_id  = "permitir-bedrock-agent"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.action_group[0].function_name
  principal     = "bedrock.amazonaws.com"
  source_arn    = aws_bedrockagent_agent.flashcards[0].agent_arn
}

# ------------------------------------------------------------------------ El agente

resource "aws_iam_role" "bedrock_agent" {
  count = local.activo
  name  = "${local.prefijo}-bedrock-agent-flashcards"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "bedrock.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

data "aws_caller_identity" "actual" {}
data "aws_region" "actual" {}

resource "aws_iam_role_policy" "bedrock_agent" {
  count = local.activo
  name  = "invocar-modelo"
  role  = aws_iam_role.bedrock_agent[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
      # El perfil de inferencia y los modelos base a los que enruta
      Resource = [
        "arn:aws:bedrock:${data.aws_region.actual.region}:${data.aws_caller_identity.actual.account_id}:inference-profile/${var.bedrock_model_id}",
        "arn:aws:bedrock:*::foundation-model/*",
      ]
    }]
  })
}

resource "aws_bedrockagent_agent" "flashcards" {
  count                       = local.activo
  agent_name                  = "${local.prefijo}-flashcards"
  foundation_model            = var.bedrock_model_id # §2, nunca literal
  agent_resource_role_arn     = aws_iam_role.bedrock_agent[0].arn
  idle_session_ttl_in_seconds = 600
  instruction                 = file("${path.module}/prompts/flashcards.txt")
}

resource "aws_bedrockagent_agent_action_group" "generar" {
  count             = local.activo
  agent_id          = aws_bedrockagent_agent.flashcards[0].agent_id
  agent_version     = "DRAFT"
  action_group_name = "generar-flashcards"

  action_group_executor {
    lambda = aws_lambda_function.action_group[0].arn
  }

  api_schema {
    payload = file("${path.module}/schemas/generar-flashcards.json")
  }
}

resource "aws_bedrockagent_agent_alias" "vivo" {
  count          = local.activo
  agent_alias_name = "vivo"
  agent_id         = aws_bedrockagent_agent.flashcards[0].agent_id
  description      = "Alias que consume flashcards en dev"
  depends_on       = [aws_bedrockagent_agent_action_group.generar]
}

# ---------------------------------------------------------------------- Costo (doc 10 §7.4)

# Un bucle de generación es el único riesgo de costo real de este módulo. La
# caché por hash y el tope de 3 intentos lo cortan; esta alarma es la red por si
# ambos fallan.
resource "aws_cloudwatch_metric_alarm" "invocaciones" {
  count               = local.activo
  alarm_name          = "${local.prefijo}-bedrock-invocaciones"
  alarm_description   = "Más de 50 InvokeModel en una hora: algo está generando en bucle"
  namespace           = "AWS/Bedrock"
  metric_name         = "Invocations"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 50
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.sns_alertas_arn]
}

output "agent_id" {
  value = var.habilitar_bedrock ? aws_bedrockagent_agent.flashcards[0].agent_id : ""
}
output "agent_alias_id" {
  value = var.habilitar_bedrock ? aws_bedrockagent_agent_alias.vivo[0].agent_alias_id : ""
}
output "modelo" { value = var.bedrock_model_id }
output "habilitado" { value = var.habilitar_bedrock }
