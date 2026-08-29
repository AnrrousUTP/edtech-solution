terraform {
  required_version = ">= 1.5"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 6.0" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }
  backend "s3" {
    bucket         = "edtech-tfstate-047600599757"
    key            = "dev/ai/terraform.tfstate"
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

# Las dos llegan de ai.tfvars, que GENERA tools/aws/resolver-modelo.sh (D8):
#   terraform apply -var-file=../ai.tfvars
variable "bedrock_model_id" { type = string }
variable "habilitar_bedrock" {
  type    = bool
  default = false
}

locals {
  estado = { bucket = "edtech-tfstate-047600599757", region = "us-east-1" }
}

data "terraform_remote_state" "storage" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/storage/terraform.tfstate" })
}
data "terraform_remote_state" "observability" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/observability/terraform.tfstate" })
}

module "ai" {
  source            = "../../../modules/ai"
  entorno           = "dev"
  bedrock_model_id  = var.bedrock_model_id
  habilitar_bedrock = var.habilitar_bedrock
  bucket_media_arn  = data.terraform_remote_state.storage.outputs.bucket_media_arn
  sns_alertas_arn   = data.terraform_remote_state.observability.outputs.sns_alertas_arn
}

output "agent_id" { value = module.ai.agent_id }
output "agent_alias_id" { value = module.ai.agent_alias_id }
output "modelo" { value = module.ai.modelo }
output "habilitado" { value = module.ai.habilitado }
