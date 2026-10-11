terraform {
  required_version = ">= 1.5"
  required_providers { aws = { source = "hashicorp/aws", version = "~> 6.0" } }
  backend "s3" {
    bucket         = "edtech-tfstate-047600599757"
    key            = "dev/services/terminal-simulator/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "edtech-tflock"
  }
}
provider "aws" {
  region = "us-east-1"
  default_tags { tags = { Project = "edtech", Env = "dev", Service = "terminal-simulator", ManagedBy = "terraform" } }
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
data "terraform_remote_state" "iot" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/iot/terraform.tfstate" })
}

module "servicio" {
  source                 = "../../../infra/modules/service"
  entorno                = "dev"
  nombre                 = "terminal-simulator"
  imagen                 = "${local.cuenta}.dkr.ecr.us-east-1.amazonaws.com/edtech/terminal-simulator:${var.image_tag}"
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
  path_pattern           = "/terminal-simulator/*"
  prioridad              = 90
  xray                   = false
  env = {
    AWS_REGION        = "us-east-1"
    IOT_DATA_ENDPOINT = data.terraform_remote_state.iot.outputs.iot_data_endpoint
    IOT_DEVICE_ID     = data.terraform_remote_state.iot.outputs.thing_name
    IOT_HEARTBEAT_MS  = "30000"
    IOT_STATE_FILE    = "/tmp/terminal-state.json"
  }
  permisos = [
    { actions = ["iot:GetThingShadow"], resources = ["arn:aws:iot:us-east-1:${local.cuenta}:thing/${data.terraform_remote_state.iot.outputs.thing_name}"] },
    { actions = ["iot:Publish"], resources = ["arn:aws:iot:us-east-1:${local.cuenta}:topic/edtech/dev/terminals/${data.terraform_remote_state.iot.outputs.thing_name}/telemetry"] }
  ]
}
output "servicio" { value = module.servicio.servicio_nombre }
output "log_group" { value = module.servicio.log_group }
