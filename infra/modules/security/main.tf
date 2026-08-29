# KMS, security groups encadenados y rol de ejecución de tareas ECS (doc 07 §10).
variable "entorno" { type = string }
variable "vpc_id" { type = string }

data "aws_caller_identity" "actual" {}

locals {
  cuenta = data.aws_caller_identity.actual.account_id
}

# ── KMS ──────────────────────────────────────────────────────────────────────
resource "aws_kms_key" "datos" {
  description         = "edtech-${var.entorno}-datos: Aurora y S3"
  enable_key_rotation = true
}

resource "aws_kms_alias" "datos" {
  name          = "alias/edtech-${var.entorno}-datos"
  target_key_id = aws_kms_key.datos.key_id
}

# La clave de mensajería debe poder usarla EventBridge para entregar a SQS cifradas
resource "aws_kms_key" "mensajeria" {
  description         = "edtech-${var.entorno}-mensajeria: SQS y EventBridge"
  enable_key_rotation = true
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AdminCuenta"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${local.cuenta}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "EventBridgeEntregaASqs"
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = ["kms:Decrypt", "kms:GenerateDataKey"]
        Resource  = "*"
      }
    ]
  })
}

resource "aws_kms_alias" "mensajeria" {
  name          = "alias/edtech-${var.entorno}-mensajeria"
  target_key_id = aws_kms_key.mensajeria.key_id
}

# ── Security groups encadenados, no por CIDR ────────────────────────────────
resource "aws_security_group" "alb" {
  name        = "edtech-${var.entorno}-alb"
  description = "ALB: 443 y 80 del mundo"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs_tasks" {
  name        = "edtech-${var.entorno}-ecs-tasks"
  description = "Tareas: 3000 solo desde el ALB"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "aurora" {
  name        = "edtech-${var.entorno}-aurora"
  description = "Aurora: 5432 solo desde las tareas ECS"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }
}

# ── Token interno catalog↔enrollment (A-19) ─────────────────────────────────
resource "random_password" "interno" {
  length  = 40
  special = false
}

resource "aws_secretsmanager_secret" "interno" {
  name                    = "edtech/${var.entorno}/interno"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "interno" {
  secret_id     = aws_secretsmanager_secret.interno.id
  secret_string = jsonencode({ token = random_password.interno.result })
}

# ── Rol de EJECUCIÓN de tareas (pull de imagen, logs, secretos del arranque) ──
resource "aws_iam_role" "ecs_execution" {
  name = "edtech-${var.entorno}-ecs-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_base" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "leer-secretos-edtech"
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = "arn:aws:secretsmanager:us-east-1:${local.cuenta}:secret:edtech/${var.entorno}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = [aws_kms_key.datos.arn, aws_kms_key.mensajeria.arn]
      }
    ]
  })
}

output "kms_datos_arn" { value = aws_kms_key.datos.arn }
output "kms_datos_id" { value = aws_kms_key.datos.key_id }
output "kms_mensajeria_arn" { value = aws_kms_key.mensajeria.arn }
output "kms_mensajeria_id" { value = aws_kms_key.mensajeria.key_id }
output "sg_alb_id" { value = aws_security_group.alb.id }
output "sg_ecs_tasks_id" { value = aws_security_group.ecs_tasks.id }
output "sg_aurora_id" { value = aws_security_group.aurora.id }
output "rol_ecs_execution_arn" { value = aws_iam_role.ecs_execution.arn }
output "secreto_interno_arn" { value = aws_secretsmanager_secret.interno.arn }
