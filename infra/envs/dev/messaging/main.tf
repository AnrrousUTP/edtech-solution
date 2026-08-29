terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    bucket         = "edtech-tfstate-047600599757"
    key            = "dev/messaging/terraform.tfstate"
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

data "terraform_remote_state" "security" {
  backend = "s3"
  config = {
    bucket = "edtech-tfstate-047600599757"
    key    = "dev/security/terraform.tfstate"
    region = "us-east-1"
  }
}

module "messaging" {
  source             = "../../../modules/messaging"
  entorno            = "dev"
  kms_mensajeria_arn = data.terraform_remote_state.security.outputs.kms_mensajeria_arn
  kms_mensajeria_id  = data.terraform_remote_state.security.outputs.kms_mensajeria_id
  ruta_eventos_json  = "${path.module}/../../../../tools/eventos.json"
}

output "bus_arn" { value = module.messaging.bus_arn }
output "bus_name" { value = module.messaging.bus_name }
output "colas" { value = module.messaging.colas }
output "dlqs" { value = module.messaging.dlqs }
