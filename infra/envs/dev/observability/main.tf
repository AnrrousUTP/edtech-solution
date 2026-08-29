terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    bucket         = "edtech-tfstate-047600599757"
    key            = "dev/observability/terraform.tfstate"
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

variable "email_alertas" {
  type    = string
  default = "lorenakimnegrillo@gmail.com" # operador (doc 07 §8)
}

data "terraform_remote_state" "messaging" {
  backend = "s3"
  config = {
    bucket = "edtech-tfstate-047600599757"
    key    = "dev/messaging/terraform.tfstate"
    region = "us-east-1"
  }
}

module "observability" {
  source        = "../../../modules/observability"
  entorno       = "dev"
  email_alertas = var.email_alertas
  dlqs          = data.terraform_remote_state.messaging.outputs.dlqs
}

output "sns_alertas_arn" { value = module.observability.sns_alertas_arn }
