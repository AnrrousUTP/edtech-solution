# Bus, reglas, colas y DLQs (doc 05 §4-§5), generados desde tools/eventos.json —
# la MISMA fuente que el init de LocalStack (doc 13 §3), para que no diverjan.
variable "entorno" { type = string }
variable "kms_mensajeria_arn" { type = string }
variable "kms_mensajeria_id" { type = string }
variable "ruta_eventos_json" { type = string }

data "aws_caller_identity" "actual" {}

locals {
  eventos        = jsondecode(file(var.ruta_eventos_json))
  colas          = local.eventos.colas
  colas_internas = local.eventos.colasInternas
  reglas         = { for r in local.eventos.reglas : r.nombre => r }
  visibilidad    = try(local.eventos.visibilidadPorCola, {})
  todas          = concat(local.colas, local.colas_internas)
}

resource "aws_cloudwatch_event_bus" "dominio" {
  name = local.eventos.bus
}

# ── DLQs (14 días, el máximo) ────────────────────────────────────────────────
resource "aws_sqs_queue" "dlq" {
  for_each                  = toset(local.todas)
  name                      = "edtech-${var.entorno}-${each.value}-dlq"
  message_retention_seconds = 1209600
  kms_master_key_id         = var.kms_mensajeria_id
}

# ── Colas (4 días, redrive a su DLQ al 5º intento) ───────────────────────────
resource "aws_sqs_queue" "cola" {
  for_each                   = toset(local.todas)
  name                       = "edtech-${var.entorno}-${each.value}"
  visibility_timeout_seconds = try(local.visibilidad[each.value], 180)
  message_retention_seconds  = 345600
  receive_wait_time_seconds  = 20
  kms_master_key_id          = var.kms_mensajeria_id
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq[each.value].arn
    maxReceiveCount     = 5
  })
}

# ── Reglas de EventBridge ────────────────────────────────────────────────────
resource "aws_cloudwatch_event_rule" "regla" {
  for_each       = local.reglas
  name           = "edtech-${var.entorno}-${each.key}"
  event_bus_name = aws_cloudwatch_event_bus.dominio.name
  event_pattern = jsonencode({
    "detail-type" = try(each.value.detailTypes, [for p in each.value.prefijos : { prefix = p }])
  })
}

# DLQ de ENTREGA por regla: captura lo que EventBridge no pudo entregar a la cola
# (distinta de la DLQ de la cola, que captura lo que el consumidor no pudo procesar)
resource "aws_sqs_queue" "dlq_entrega" {
  for_each                  = local.reglas
  name                      = "edtech-${var.entorno}-${each.key}-entrega-dlq"
  message_retention_seconds = 1209600
  kms_master_key_id         = var.kms_mensajeria_id
}

resource "aws_cloudwatch_event_target" "destino" {
  for_each       = local.reglas
  rule           = aws_cloudwatch_event_rule.regla[each.key].name
  event_bus_name = aws_cloudwatch_event_bus.dominio.name
  arn            = aws_sqs_queue.cola[each.value.destino].arn

  dead_letter_config {
    arn = aws_sqs_queue.dlq_entrega[each.key].arn
  }
  retry_policy {
    maximum_event_age_in_seconds = 3600
    maximum_retry_attempts       = 3
  }
}

# ── Políticas: EventBridge puede escribir en las colas destino y en las DLQ de entrega ──
resource "aws_sqs_queue_policy" "permitir_eventbridge" {
  for_each  = toset(local.colas)
  queue_url = aws_sqs_queue.cola[each.value].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.cola[each.value].arn
      Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.actual.account_id } }
    }]
  })
}

resource "aws_sqs_queue_policy" "permitir_eventbridge_dlq_entrega" {
  for_each  = local.reglas
  queue_url = aws_sqs_queue.dlq_entrega[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.dlq_entrega[each.key].arn
      Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.actual.account_id } }
    }]
  })
}

output "bus_arn" { value = aws_cloudwatch_event_bus.dominio.arn }
output "bus_name" { value = aws_cloudwatch_event_bus.dominio.name }
output "colas" {
  value = { for c in local.todas : c => { url = aws_sqs_queue.cola[c].id, arn = aws_sqs_queue.cola[c].arn } }
}
output "dlqs" {
  value = merge(
    { for c in local.todas : c => { nombre = aws_sqs_queue.dlq[c].name, arn = aws_sqs_queue.dlq[c].arn } },
    { for r in keys(local.reglas) : "${r}-entrega" => { nombre = aws_sqs_queue.dlq_entrega[r].name, arn = aws_sqs_queue.dlq_entrega[r].arn } }
  )
}
