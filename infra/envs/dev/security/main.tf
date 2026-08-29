terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    bucket         = "edtech-tfstate-047600599757"
    key            = "dev/security/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "edtech-tflock"
  }
}

provider "aws" {
  region = "us-east-1"
  default_tags {
    tags = { Project = "edtech", Env = "dev", Service = "shared", ManagedBy = "terraform" }
  }
}

data "terraform_remote_state" "network" {
  backend = "s3"
  config = {
    bucket = "edtech-tfstate-047600599757"
    key    = "dev/network/terraform.tfstate"
    region = "us-east-1"
  }
}

module "security" {
  source  = "../../../modules/security"
  entorno = "dev"
  vpc_id  = data.terraform_remote_state.network.outputs.vpc_id
}

output "kms_datos_arn" { value = module.security.kms_datos_arn }
output "kms_datos_id" { value = module.security.kms_datos_id }
output "kms_mensajeria_arn" { value = module.security.kms_mensajeria_arn }
output "kms_mensajeria_id" { value = module.security.kms_mensajeria_id }
output "sg_alb_id" { value = module.security.sg_alb_id }
output "sg_ecs_tasks_id" { value = module.security.sg_ecs_tasks_id }
output "sg_aurora_id" { value = module.security.sg_aurora_id }
output "rol_ecs_execution_arn" { value = module.security.rol_ecs_execution_arn }
