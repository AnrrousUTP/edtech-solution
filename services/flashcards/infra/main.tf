# Infra propia de flashcards (doc 06 s5.3): state independiente; consume los
# recursos compartidos por terraform_remote_state.
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    bucket         = "edtech-tfstate-047600599757"
    key            = "dev/services/flashcards/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "edtech-tflock"
  }
}

provider "aws" {
  region = "us-east-1"
  default_tags {
    tags = { Project = "edtech", Env = "dev", Service = "flashcards", ManagedBy = "terraform" }
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
data "terraform_remote_state" "storage" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/storage/terraform.tfstate" })
}

module "servicio" {
  source = "../../../infra/modules/service"

  entorno           = "dev"
  nombre            = "flashcards"
  imagen            = "${local.cuenta}.dkr.ecr.us-east-1.amazonaws.com/edtech/flashcards:${var.image_tag}"
  vpc_id            = data.terraform_remote_state.network.outputs.vpc_id
  subredes_privadas = data.terraform_remote_state.network.outputs.subredes_privadas
  sg_ecs_tasks_id   = data.terraform_remote_state.security.outputs.sg_ecs_tasks_id
  cluster_arn       = data.terraform_remote_state.compute.outputs.cluster_arn
  cluster_name      = data.terraform_remote_state.compute.outputs.cluster_name
  listener_arn      = data.terraform_remote_state.compute.outputs.listener_arn
  rol_execution_arn = data.terraform_remote_state.security.outputs.rol_ecs_execution_arn
  path_pattern      = "/api/flashcards/*"
  prioridad         = 50
  spot              = true

  env = {
    PORT                 = "3000"
    AWS_REGION           = "us-east-1"
    EVENT_BUS_NAME       = data.terraform_remote_state.messaging.outputs.bus_name
    DB_SECRET_NAME       = "edtech/dev/db/flashcards"
    QUEUE_URL            = data.terraform_remote_state.messaging.outputs.colas["flashcards"].url
    QUEUE_GENERACION_URL = data.terraform_remote_state.messaging.outputs.colas["flashcards-generacion"].url
    GENERADOR_FLASHCARDS = "fake"
    COGNITO_ISSUER       = data.terraform_remote_state.cognito.outputs.issuer
    LOG_LEVEL            = "info"
  }

  # Minimo privilegio (doc 07 s10): solo lo que flashcards usa
  permisos = [
    {
      actions   = ["events:PutEvents"]
      resources = [data.terraform_remote_state.messaging.outputs.bus_arn]
    },
    {
      actions = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:SendMessage"]
      resources = [
        data.terraform_remote_state.messaging.outputs.colas["flashcards"].arn,
        data.terraform_remote_state.messaging.outputs.colas["flashcards-generacion"].arn,
      ]
    },
    {
      actions = ["secretsmanager:GetSecretValue"]
      resources = [
        data.terraform_remote_state.database.outputs.secretos_db["flashcards"],
      ]
    },
    {
      actions   = ["s3:GetObject"]
      resources = ["${data.terraform_remote_state.storage.outputs.bucket_media_arn}/contenido/*"]
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
      resources = ["arn:aws:rds-db:us-east-1:${local.cuenta}:dbuser:${data.terraform_remote_state.database.outputs.cluster_resource_id}/svc_flashcards"]
    },
  ]
}

output "servicio" { value = module.servicio.servicio_nombre }
output "log_group" { value = module.servicio.log_group }
