# F2: SNS de alertas, alarma por CADA DLQ (la más importante) y presupuesto con
# aviso al 80% POR PROYECCIÓN (doc 16 §5, R1). El dashboard y las alarmas de
# ALB/ECS/Aurora se agregan en F10, cuando existan esos recursos (ya estan).
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

# ---------------------------------------------------------------------------
# F10: el resto de la tabla del doc 07 §8. Todo lo de abajo depende de recursos
# que en F2 todavia no existian (ALB, servicios ECS, Aurora), asi que llega
# ahora y no antes.
# ---------------------------------------------------------------------------

variable "servicios" {
  description = "Nombres de los servicios ECS (sin el prefijo edtech-<entorno>-svc-)"
  type        = list(string)
  default     = []
}
variable "alb_suffix" {
  description = "Sufijo del ARN del ALB, tal como lo pide la dimension LoadBalancer de CloudWatch"
  type        = string
}
variable "cluster_name" { type = string }
variable "colas" {
  description = "Colas principales por nombre, para la profundidad y la edad del mensaje mas viejo"
  type        = map(string)
  default     = {}
}
variable "aurora_cluster_id" { type = string }
variable "aurora_max_conexiones" {
  description = "Maximo de conexiones del cluster; el 80 % de esto dispara la alarma (R9)"
  type        = number
  default     = 200
}

locals {
  prefijo = "edtech-${var.entorno}"
}

# Servicio roto: 5xx que el ALB ve venir del target, no los suyos propios
resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${local.prefijo}-alb-5xx"
  alarm_description   = "Mas de 10 respuestas 5xx de los targets en 5 minutos"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  dimensions          = { LoadBalancer = var.alb_suffix }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]
}

# Crash loop: tipicamente una migracion que falla al arrancar (R2)
resource "aws_cloudwatch_metric_alarm" "ecs_sin_tareas" {
  for_each            = toset(var.servicios)
  alarm_name          = "${local.prefijo}-ecs-sin-tareas-${each.value}"
  alarm_description   = "El servicio ${each.value} lleva 2 minutos sin ninguna tarea corriendo"
  namespace           = "ECS/ContainerInsights"
  metric_name         = "RunningTaskCount"
  dimensions          = { ClusterName = var.cluster_name, ServiceName = "${local.prefijo}-svc-${each.value}" }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching" # sin dato tambien es "no hay tareas"
  alarm_actions       = [aws_sns_topic.alertas.arn]
}

# Query sin indice
resource "aws_cloudwatch_metric_alarm" "aurora_cpu" {
  alarm_name          = "${local.prefijo}-aurora-cpu"
  alarm_description   = "CPU de Aurora por encima del 80 % durante 10 minutos"
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  dimensions          = { DBClusterIdentifier = var.aurora_cluster_id }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]
}

# Fuga de conexiones (R9)
resource "aws_cloudwatch_metric_alarm" "aurora_conexiones" {
  alarm_name          = "${local.prefijo}-aurora-conexiones"
  alarm_description   = "Conexiones a Aurora por encima del 80 % del maximo"
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  dimensions          = { DBClusterIdentifier = var.aurora_cluster_id }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = floor(var.aurora_max_conexiones * 0.8)
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]
}

# El consumidor no da abasto o esta caido: los mensajes envejecen en la cola
resource "aws_cloudwatch_metric_alarm" "cola_vieja" {
  for_each            = var.colas
  alarm_name          = "${local.prefijo}-cola-vieja-${each.key}"
  alarm_description   = "El mensaje mas viejo de ${each.value} lleva mas de 15 minutos sin procesarse"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  dimensions          = { QueueName = each.value }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 900
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]
}

# X-Ray: el flujo cruza EventBridge y SQS, donde sin traza un evento perdido es
# invisible (doc 07 §8). En dev se muestrea TODO: el volumen es minimo y perder
# justo la traza del fallo que se esta investigando seria lo peor posible.
resource "aws_xray_sampling_rule" "todo" {
  rule_name      = "${local.prefijo}-todo"
  priority       = 1000
  version        = 1
  reservoir_size = 1
  fixed_rate     = 1.0
  service_name   = "*"
  service_type   = "*"
  host           = "*"
  http_method    = "*"
  url_path       = "*"
  resource_arn   = "*"
}

# Un solo dashboard: lo que se mira cuando algo va mal, en el orden en que se
# mira (doc 07 §8).
resource "aws_cloudwatch_dashboard" "principal" {
  dashboard_name = "${local.prefijo}-principal"
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Peticiones y errores del ALB"
          region = "us-east-1"
          view   = "timeSeries"
          stat   = "Sum"
          period = 300
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.alb_suffix],
            [".", "HTTPCode_Target_5XX_Count", ".", "."],
            [".", "HTTPCode_Target_4XX_Count", ".", "."],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Latencia p99 por servicio"
          region = "us-east-1"
          view   = "timeSeries"
          stat   = "p99"
          period = 300
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.alb_suffix],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Profundidad de cada cola"
          region = "us-east-1"
          view   = "timeSeries"
          stat   = "Maximum"
          period = 300
          metrics = [
            for c in values(var.colas) :
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", c]
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Tareas ECS corriendo por servicio"
          region = "us-east-1"
          view   = "timeSeries"
          stat   = "Average"
          period = 300
          metrics = [
            for s in var.servicios :
            ["ECS/ContainerInsights", "RunningTaskCount", "ClusterName", var.cluster_name,
            "ServiceName", "${local.prefijo}-svc-${s}"]
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "Aurora: ACU, CPU y conexiones"
          region = "us-east-1"
          view   = "timeSeries"
          period = 300
          metrics = [
            ["AWS/RDS", "ServerlessDatabaseCapacity", "DBClusterIdentifier", var.aurora_cluster_id],
            [".", "CPUUtilization", ".", "."],
            [".", "DatabaseConnections", ".", "."],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "DLQs (deberia ser una linea plana en cero)"
          region = "us-east-1"
          view   = "timeSeries"
          stat   = "Maximum"
          period = 300
          metrics = [
            for d in var.dlqs :
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", d.nombre]
          ]
        }
      },
    ]
  })
}

output "dashboard" { value = aws_cloudwatch_dashboard.principal.dashboard_name }
