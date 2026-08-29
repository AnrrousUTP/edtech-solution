terraform {
  required_version = ">= 1.5"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  backend "s3" {
    bucket         = "edtech-tfstate-047600599757"
    key            = "dev/database/terraform.tfstate"
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

module "database" {
  source  = "../../../modules/database"
  entorno = "dev"
}

output "cluster_arn" { value = module.database.cluster_arn }
output "cluster_endpoint" { value = module.database.cluster_endpoint }
output "cluster_resource_id" { value = module.database.cluster_resource_id }
output "secretos_db" { value = module.database.secretos_db }
