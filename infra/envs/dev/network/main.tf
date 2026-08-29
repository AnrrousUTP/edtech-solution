terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    bucket         = "edtech-tfstate-047600599757"
    key            = "dev/network/terraform.tfstate"
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

module "network" {
  source                        = "../../../modules/network"
  entorno                       = "dev"
  habilitar_endpoints_interface = false # doc 16 §2: en dev, solo Gateway
}

output "vpc_id" { value = module.network.vpc_id }
output "vpc_cidr" { value = module.network.vpc_cidr }
output "subredes_publicas" { value = module.network.subredes_publicas }
output "subredes_privadas" { value = module.network.subredes_privadas }
