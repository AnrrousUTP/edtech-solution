terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    bucket         = "edtech-tfstate-047600599757"
    key            = "dev/storage/terraform.tfstate"
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

module "storage" {
  source        = "../../../modules/storage"
  entorno       = "dev"
  kms_datos_arn = data.terraform_remote_state.security.outputs.kms_datos_arn
}

output "bucket_media" { value = module.storage.bucket_media }
output "bucket_media_arn" { value = module.storage.bucket_media_arn }
output "bucket_estaticos" { value = module.storage.bucket_estaticos }
output "bucket_estaticos_arn" { value = module.storage.bucket_estaticos_arn }
