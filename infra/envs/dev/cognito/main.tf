terraform {
  required_version = ">= 1.5"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 6.0" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }
  backend "s3" {
    bucket         = "edtech-tfstate-047600599757"
    key            = "dev/cognito/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "edtech-tflock"
  }
}

provider "aws" {
  region = "us-east-1"
  default_tags {
    tags = { Project = "edtech", Env = "dev", Service = "identity-access", ManagedBy = "terraform" }
  }
}

data "terraform_remote_state" "messaging" {
  backend = "s3"
  config = {
    bucket = "edtech-tfstate-047600599757"
    key    = "dev/messaging/terraform.tfstate"
    region = "us-east-1"
  }
}

# El borde HTTPS (A-34) es de donde vuelve el Hosted UI en dev; localhost sigue
# en la lista para el `docker compose` con Cognito real.
data "terraform_remote_state" "edge" {
  backend = "s3"
  config = {
    bucket = "edtech-tfstate-047600599757"
    key    = "dev/edge/terraform.tfstate"
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

module "cognito" {
  source             = "../../../modules/cognito"
  entorno            = "dev"
  cola_identity_arn  = data.terraform_remote_state.messaging.outputs.colas["identity"].arn
  cola_identity_url  = data.terraform_remote_state.messaging.outputs.colas["identity"].url
  kms_mensajeria_arn = data.terraform_remote_state.security.outputs.kms_mensajeria_arn
  ruta_lambdas       = "${path.module}/../../../../services/identity-access/lambdas"

  callback_urls = [
    "http://localhost:3000/api/auth/callback",
    "${trimsuffix(data.terraform_remote_state.edge.outputs.url, "/")}/api/auth/callback",
  ]
  logout_urls = [
    "http://localhost:3000/",
    data.terraform_remote_state.edge.outputs.url,
  ]
}

output "user_pool_id" { value = module.cognito.user_pool_id }
output "issuer" { value = module.cognito.issuer }
output "client_web_id" { value = module.cognito.client_web_id }
output "client_pruebas_id" { value = module.cognito.client_pruebas_id }
output "hosted_ui_dominio" { value = module.cognito.hosted_ui_dominio }
