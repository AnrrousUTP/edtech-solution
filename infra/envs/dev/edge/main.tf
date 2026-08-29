terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    bucket         = "edtech-tfstate-047600599757"
    key            = "dev/edge/terraform.tfstate"
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

# WAF de CloudFront vive siempre en us-east-1; acá coinciden, pero el alias deja
# el módulo correcto si algún día la región cambia.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = { Project = "edtech", Env = "dev", Service = "shared", ManagedBy = "terraform" }
  }
}

locals {
  estado = { bucket = "edtech-tfstate-047600599757", region = "us-east-1" }
}

data "terraform_remote_state" "compute" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/compute-base/terraform.tfstate" })
}

data "terraform_remote_state" "storage" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/storage/terraform.tfstate" })
}

data "aws_s3_bucket" "estaticos" {
  bucket = data.terraform_remote_state.storage.outputs.bucket_estaticos
}

module "edge" {
  source = "../../../modules/edge"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  entorno                 = "dev"
  alb_dns                 = data.terraform_remote_state.compute.outputs.alb_dns
  bucket_estaticos        = data.terraform_remote_state.storage.outputs.bucket_estaticos
  bucket_estaticos_arn    = data.terraform_remote_state.storage.outputs.bucket_estaticos_arn
  bucket_estaticos_domain = data.aws_s3_bucket.estaticos.bucket_regional_domain_name
  # A-34: ponlo en true cuando AWS verifique la cuenta para CloudFront
  habilitar_cloudfront = false
}

output "dominio" { value = module.edge.dominio }
output "url" { value = module.edge.url }
output "usando_cloudfront" { value = module.edge.usando_cloudfront }
