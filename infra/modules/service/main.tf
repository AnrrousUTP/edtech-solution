# Módulo genérico de servicio (doc 06 §5.3): task definition, servicio ECS,
# target group + listener rule, rol IAM de mínimo privilegio, auto scaling.
# Se instancia una vez por microservicio, cada uno con su propio state.
variable "entorno" { type = string }
variable "nombre" { type = string }
variable "imagen" { type = string } # URI completa con tag = SHA del commit
variable "vpc_id" { type = string }
variable "subredes_privadas" { type = list(string) }
variable "sg_ecs_tasks_id" { type = string }
variable "cluster_arn" { type = string }
variable "cluster_name" { type = string }
variable "listener_arn" { type = string }
variable "rol_execution_arn" { type = string }
variable "path_pattern" { type = string }
variable "prioridad" { type = number }
variable "spot" {
  type    = bool
  default = true # dev: todos menos payments (doc 07 §6)
}
variable "desired_count" {
  type    = number
  default = 1
}
variable "env" {
  type    = map(string)
  default = {}
}
variable "permisos" {
  description = "Statements IAM del rol de TAREA (mínimo privilegio, doc 07 §10)"
  type = list(object({
    actions   = list(string)
    resources = list(string)
  }))
}
variable "xray" {
  description = "Sidecar del daemon de X-Ray + permiso para subir segmentos (doc 07 §8)"
  type        = bool
  default     = true
}
variable "health_check_path" {
  type    = string
  default = "/ready"
}

data "aws_caller_identity" "actual" {}

resource "aws_cloudwatch_log_group" "servicio" {
  name              = "/ecs/edtech-${var.entorno}-${var.nombre}"
  retention_in_days = 7 # dev (doc 07 §6)
}

resource "aws_iam_role" "task" {
  name = "edtech-${var.entorno}-task-${var.nombre}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "task" {
  name = "permisos-minimos"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [{
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.servicio.arn}:*"
      }],
      var.xray ? [{
        Effect   = "Allow"
        Action   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
        Resource = "*" # la API de X-Ray no admite recursos concretos
      }] : [],
      [for p in var.permisos : {
        Effect   = "Allow"
        Action   = p.actions
        Resource = p.resources
      }]
    )
  })
}

resource "aws_ecs_task_definition" "servicio" {
  family                   = "edtech-${var.entorno}-${var.nombre}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = var.rol_execution_arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode(concat([
    {
      name        = var.nombre
      image       = var.imagen
      essential   = true
      stopTimeout = 30
      portMappings = [{ containerPort = 3000, protocol = "tcp" }]
      environment = concat(
        [for k, v in var.env : { name = k, value = v }],
        # El daemon escucha en el localhost de la task (network mode awsvpc):
        # sin esta variable el kernel no traza (doc 07 §8).
        var.xray ? [{ name = "AWS_XRAY_DAEMON_ADDRESS", value = "127.0.0.1:2000" }] : []
      )
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.servicio.name
          awslogs-region        = "us-east-1"
          awslogs-stream-prefix = var.nombre
        }
      }
    },
    ],
    var.xray ? [{
      # Sidecar oficial: recibe los segmentos por UDP y los sube a X-Ray. No es
      # essential a proposito — que se caiga la traza no puede tumbar el servicio.
      name         = "xray-daemon"
      image        = "public.ecr.aws/xray/aws-xray-daemon:latest"
      essential    = false
      cpu          = 32
      memory       = 256
      portMappings = [{ containerPort = 2000, protocol = "udp" }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.servicio.name
          awslogs-region        = "us-east-1"
          awslogs-stream-prefix = "xray"
        }
      }
    }] : []
  )
}

resource "aws_lb_target_group" "servicio" {
  name        = "edtech-${var.entorno}-tg-${substr(var.nombre, 0, 18)}"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = var.health_check_path
    interval            = 30
    timeout             = 10
    healthy_threshold   = 2
    unhealthy_threshold = 4
    matcher             = "200"
  }

  deregistration_delay = 30
}

resource "aws_lb_listener_rule" "servicio" {
  listener_arn = var.listener_arn
  priority     = var.prioridad

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.servicio.arn
  }

  condition {
    path_pattern {
      values = [var.path_pattern]
    }
  }
}

resource "aws_ecs_service" "servicio" {
  name            = "edtech-${var.entorno}-svc-${var.nombre}"
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.servicio.arn
  desired_count   = var.desired_count

  capacity_provider_strategy {
    capacity_provider = var.spot ? "FARGATE_SPOT" : "FARGATE"
    weight            = 1
  }

  network_configuration {
    subnets          = var.subredes_privadas
    security_groups  = [var.sg_ecs_tasks_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.servicio.arn
    container_name   = var.nombre
    container_port   = 3000
  }

  # La migración corre al arrancar; darle tiempo antes de matar la tarea
  health_check_grace_period_seconds = 120
}

# Auto scaling por CPU al 70%, 1-3 tareas (doc 07 §6)
resource "aws_appautoscaling_target" "servicio" {
  max_capacity       = 3
  min_capacity       = 1
  resource_id        = "service/${var.cluster_name}/${aws_ecs_service.servicio.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "cpu-70"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.servicio.resource_id
  scalable_dimension = aws_appautoscaling_target.servicio.scalable_dimension
  service_namespace  = aws_appautoscaling_target.servicio.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value = 70
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

output "servicio_nombre" { value = aws_ecs_service.servicio.name }
output "task_role_arn" { value = aws_iam_role.task.arn }
output "log_group" { value = aws_cloudwatch_log_group.servicio.name }
