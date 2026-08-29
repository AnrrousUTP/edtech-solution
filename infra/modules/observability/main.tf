# F2: SNS de alertas, alarma por CADA DLQ (la más importante) y presupuesto con
# aviso al 80% POR PROYECCIÓN (doc 16 §5, R1). El dashboard y las alarmas de
# ALB/ECS/Aurora se agregan en F10, cuando existan esos recursos.
variable "entorno" { type = string }
variable "email_alertas" { type = string }
variable "dlqs" {
  type = map(object({ nombre = string, arn = string }))
}
variable "limite_mensual_usd" {
  type    = string
  default = "120"
}

resource "aws_sns_topic" "alertas" {
  name = "edtech-${var.entorno}-alertas"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alertas.arn
  protocol  = "email"
  endpoint  = var.email_alertas
}

# Una DLQ que se llena en silencio es la forma más común de perder eventos
resource "aws_cloudwatch_metric_alarm" "dlq_con_mensajes" {
  for_each            = var.dlqs
  alarm_name          = "edtech-${var.entorno}-dlq-${each.key}"
  alarm_description   = "Hay mensajes en la DLQ ${each.value.nombre}: eventos sin procesar"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = each.value.nombre }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]
}

resource "aws_budgets_budget" "dev" {
  name         = "edtech-${var.entorno}-mensual"
  budget_type  = "COST"
  limit_amount = var.limite_mensual_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED" # avisa por proyección, no por hecho consumado
    subscriber_email_addresses = [var.email_alertas]
  }
}

output "sns_alertas_arn" { value = aws_sns_topic.alertas.arn }
