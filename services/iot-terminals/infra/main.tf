terraform {
  required_version = ">= 1.5"
  required_providers { aws = { source = "hashicorp/aws", version = "~> 6.0" } }
  backend "s3" {
    bucket         = "edtech-tfstate-047600599757"
    key            = "dev/services/iot-terminals/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "edtech-tflock"
  }
}
provider "aws" {
  region = "us-east-1"
  default_tags { tags = { Project = "edtech", Env = "dev", Service = "iot-terminals", ManagedBy = "terraform" } }
}
variable "image_tag" {
  type    = string
  default = "9932281-paused-20261011"
}
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
data "terraform_remote_state" "iot" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/iot/terraform.tfstate" })
}

module "servicio" {
  source                 = "../../../infra/modules/service"
  entorno                = "dev"
  nombre                 = "iot-terminals"
  imagen                 = "${local.cuenta}.dkr.ecr.us-east-1.amazonaws.com/edtech/iot-terminals:${var.image_tag}"
  vpc_id                 = data.terraform_remote_state.network.outputs.vpc_id
  subredes_privadas      = data.terraform_remote_state.network.outputs.subredes_privadas
  sg_ecs_tasks_id        = data.terraform_remote_state.security.outputs.sg_ecs_tasks_id
  cluster_arn            = data.terraform_remote_state.compute.outputs.cluster_arn
  cluster_name           = data.terraform_remote_state.compute.outputs.cluster_name
  desired_count          = 0
  habilitar_balanceador  = false
  habilitar_autoescalado = false
  listener_arn           = null
  rol_execution_arn      = data.terraform_remote_state.security.outputs.rol_ecs_execution_arn
  path_pattern           = "/api/iot/*"
  prioridad              = 80
  env = {
    PORT                = "3000", AWS_REGION = "us-east-1"
    QUEUE_URL           = data.terraform_remote_state.messaging.outputs.colas["iot-terminals"].url
    TELEMETRY_QUEUE_URL = data.terraform_remote_state.messaging.outputs.colas["iot-telemetry"].url
    IOT_DATA_ENDPOINT   = data.terraform_remote_state.iot.outputs.iot_data_endpoint
    IOT_DEVICE_ID       = data.terraform_remote_state.iot.outputs.thing_name
    DB_HOST             = data.terraform_remote_state.database.outputs.cluster_endpoint
    DB_USER             = "svc_iot_terminals"
    COGNITO_ISSUER      = data.terraform_remote_state.cognito.outputs.issuer
    COGNITO_CLIENT_ID   = "${data.terraform_remote_state.cognito.outputs.client_web_id},${data.terraform_remote_state.cognito.outputs.client_pruebas_id}"
    LOG_LEVEL           = "info"
  }
  permisos = [
    { actions = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:SendMessage"], resources = [data.terraform_remote_state.messaging.outputs.colas["iot-terminals"].arn, data.terraform_remote_state.messaging.outputs.colas["iot-telemetry"].arn] },
    { actions = ["iot:GetThingShadow", "iot:UpdateThingShadow"], resources = ["arn:aws:iot:us-east-1:${local.cuenta}:thing/${data.terraform_remote_state.iot.outputs.thing_name}"] },
    { actions = ["iot:Publish"], resources = ["arn:aws:iot:us-east-1:${local.cuenta}:topic/edtech/dev/terminals/${data.terraform_remote_state.iot.outputs.thing_name}/alerts"] },
    { actions = ["kms:Decrypt", "kms:GenerateDataKey"], resources = [data.terraform_remote_state.security.outputs.kms_mensajeria_arn] },
    { actions = ["rds-db:connect"], resources = ["arn:aws:rds-db:us-east-1:${local.cuenta}:dbuser:${data.terraform_remote_state.database.outputs.cluster_resource_id}/svc_iot_terminals"] }
  ]
}
output "servicio" { value = module.servicio.servicio_nombre }
output "log_group" { value = module.servicio.log_group }
