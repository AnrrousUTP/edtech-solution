terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    bucket         = "edtech-tfstate-047600599757"
    key            = "dev/compute-base/terraform.tfstate"
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

data "terraform_remote_state" "security" {
  backend = "s3"
  config = {
    bucket = "edtech-tfstate-047600599757"
    key    = "dev/security/terraform.tfstate"
    region = "us-east-1"
  }
}

module "compute_base" {
  source            = "../../../modules/compute-base"
  entorno           = "dev"
  vpc_id            = data.terraform_remote_state.network.outputs.vpc_id
  subredes_publicas = data.terraform_remote_state.network.outputs.subredes_publicas
  sg_alb_id         = data.terraform_remote_state.security.outputs.sg_alb_id
}

output "cluster_arn" { value = module.compute_base.cluster_arn }
output "cluster_name" { value = module.compute_base.cluster_name }
output "alb_arn" { value = module.compute_base.alb_arn }
output "alb_dns" { value = module.compute_base.alb_dns }
output "listener_arn" { value = module.compute_base.listener_arn }
