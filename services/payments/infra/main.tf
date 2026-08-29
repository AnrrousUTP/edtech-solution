# Infra propia de payments (doc 06 §5.3): state independiente.
# Único servicio en Fargate NORMAL (no Spot): perder un webhook de PayPal por
# una interrupción sí duele (doc 07 §6).
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    bucket         = "edtech-tfstate-047600599757"
    key            = "dev/services/payments/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "edtech-tflock"
  }
}

provider "aws" {
  region = "us-east-1"
  default_tags {
    tags = { Project = "edtech", Env = "dev", Service = "payments", ManagedBy = "terraform" }
  }
}

variable "image_tag" { type = string }

locals {
  cuenta = "047600599757"
  estado = { bucket = "edtech-tfstate-047600599757", region = "us-east-1" }
}

data "terraform_remote_state" "network" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/network/terraform.tfstate" })
}
data "terraform_remote_state" "security" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/security/terraform.tfstate" })
}
data "terraform_remote_state" "compute" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/compute-base/terraform.tfstate" })
}
data "terraform_remote_state" "messaging" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/messaging/terraform.tfstate" })
}
data "terraform_remote_state" "database" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/database/terraform.tfstate" })
}
data "terraform_remote_state" "cognito" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/cognito/terraform.tfstate" })
}
data "terraform_remote_state" "edge" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/edge/terraform.tfstate" })
}

data "aws_secretsmanager_secret" "paypal" {
  name = "edtech/dev/paypal"
}

module "servicio" {
  source = "../../../infra/modules/service"

  entorno           = "dev"
  nombre            = "payments"
  imagen            = "${local.cuenta}.dkr.ecr.us-east-1.amazonaws.com/edtech/payments:${var.image_tag}"
  vpc_id            = data.terraform_remote_state.network.outputs.vpc_id
  subredes_privadas = data.terraform_remote_state.network.outputs.subredes_privadas
  sg_ecs_tasks_id   = data.terraform_remote_state.security.outputs.sg_ecs_tasks_id
  cluster_arn       = data.terraform_remote_state.compute.outputs.cluster_arn
  cluster_name      = data.terraform_remote_state.compute.outputs.cluster_name
  listener_arn      = data.terraform_remote_state.compute.outputs.listener_arn
  rol_execution_arn = data.terraform_remote_state.security.outputs.rol_ecs_execution_arn
  path_pattern      = "/api/payments/*"
  prioridad         = 60
  spot              = false # doc 07 §6: payments no va en Spot

  env = {
    PORT               = "3000"
    AWS_REGION         = "us-east-1"
    EVENT_BUS_NAME     = data.terraform_remote_state.messaging.outputs.bus_name
    DB_SECRET_NAME     = "edtech/dev/db/payments"
    PAYPAL_SECRET_NAME = "edtech/dev/paypal"
    QUEUE_URL          = data.terraform_remote_state.messaging.outputs.colas["payments"].url
    QUEUE_WEBHOOKS_URL = data.terraform_remote_state.messaging.outputs.colas["payments-webhooks"].url
    COGNITO_ISSUER     = data.terraform_remote_state.cognito.outputs.issuer
    URL_BASE           = data.terraform_remote_state.edge.outputs.url
    LOG_LEVEL          = "info"
  }

  # Mínimo privilegio (doc 07 §10): payments es el ÚNICO con acceso al secreto
  # de PayPal, y solo sobre SUS dos colas.
  permisos = [
    {
      actions   = ["events:PutEvents"]
      resources = [data.terraform_remote_state.messaging.outputs.bus_arn]
    },
    {
      actions = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:SendMessage"]
      resources = [
        data.terraform_remote_state.messaging.outputs.colas["payments"].arn,
        data.terraform_remote_state.messaging.outputs.colas["payments-webhooks"].arn,
      ]
    },
    {
      actions = ["secretsmanager:GetSecretValue"]
      resources = [
        data.terraform_remote_state.database.outputs.secretos_db["payments"],
        data.aws_secretsmanager_secret.paypal.arn,
      ]
    },
    {
      actions = ["kms:Decrypt", "kms:GenerateDataKey"]
      resources = [
        data.terraform_remote_state.security.outputs.kms_datos_arn,
        data.terraform_remote_state.security.outputs.kms_mensajeria_arn,
      ]
    },
    {
      actions   = ["rds-db:connect"]
      resources = ["arn:aws:rds-db:us-east-1:${local.cuenta}:dbuser:${data.terraform_remote_state.database.outputs.cluster_resource_id}/svc_payments"]
    },
  ]
}

output "servicio" { value = module.servicio.servicio_nombre }
output "log_group" { value = module.servicio.log_group }
output "url_webhook" { value = "${data.terraform_remote_state.edge.outputs.url}api/payments/webhook" }
