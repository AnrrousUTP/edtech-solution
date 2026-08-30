# Infra propia del frontend: mismo patrón que un servicio (state independiente),
# porque se despliega igual — imagen a ECR, task en Fargate, regla en el ALB.
#
# A-43: la regla del frontend es `/*` con la prioridad MÁS ALTA en número (la
# última que evalúa el ALB), así que solo atiende lo que no matcheó ninguna
# regla `/api/…`. El doc 07 §5 mandaba ese `/*` a CloudFront→S3; con CloudFront
# bloqueado (A-34) el SSR de Next tiene que estar detrás del mismo ALB.
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    bucket         = "edtech-tfstate-047600599757"
    key            = "dev/services/web/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "edtech-tflock"
  }
}

provider "aws" {
  region = "us-east-1"
  default_tags {
    tags = { Project = "edtech", Env = "dev", Service = "web", ManagedBy = "terraform" }
  }
}

variable "image_tag" { type = string }

locals {
  cuenta = "047600599757"
  estado = { bucket = "edtech-tfstate-047600599757", region = "us-east-1" }
}

data "terraform_remote_state" "network" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/network/terraform.tfstate" })
}
data "terraform_remote_state" "security" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/security/terraform.tfstate" })
}
data "terraform_remote_state" "compute" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/compute-base/terraform.tfstate" })
}
data "terraform_remote_state" "cognito" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/cognito/terraform.tfstate" })
}
data "terraform_remote_state" "edge" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/edge/terraform.tfstate" })
}

module "servicio" {
  source = "../../../infra/modules/service"

  entorno           = "dev"
  nombre            = "web"
  imagen            = "${local.cuenta}.dkr.ecr.us-east-1.amazonaws.com/edtech/web:${var.image_tag}"
  vpc_id            = data.terraform_remote_state.network.outputs.vpc_id
  subredes_privadas = data.terraform_remote_state.network.outputs.subredes_privadas
  sg_ecs_tasks_id   = data.terraform_remote_state.security.outputs.sg_ecs_tasks_id
  cluster_arn       = data.terraform_remote_state.compute.outputs.cluster_arn
  cluster_name      = data.terraform_remote_state.compute.outputs.cluster_name
  listener_arn      = data.terraform_remote_state.compute.outputs.listener_arn
  rol_execution_arn = data.terraform_remote_state.security.outputs.rol_ecs_execution_arn
  path_pattern      = "/*"
  prioridad         = 100 # después de todas las reglas /api/… (A-23)
  spot              = true
  health_check_path = "/"
  # El frontend no emite segmentos propios: no monta el kernel de Express, y su
  # parte de la traza ya la ve el ALB. Sin sidecar (doc 07 §8 traza los servicios).
  xray = false

  env = {
    PORT = "3000"
    # Server-side: el salto interno al ALB no sale a internet
    API_BASE = "http://${data.terraform_remote_state.compute.outputs.alb_dns}"
    # Lo que usa el navegador: el borde HTTPS (A-34/A-35)
    NEXT_PUBLIC_API_BASE = trimsuffix(data.terraform_remote_state.edge.outputs.url, "/")
    APP_URL              = trimsuffix(data.terraform_remote_state.edge.outputs.url, "/")
    COGNITO_DOMINIO      = data.terraform_remote_state.cognito.outputs.hosted_ui_dominio
    COGNITO_CLIENT_ID    = data.terraform_remote_state.cognito.outputs.client_web_id
    COGNITO_REGION       = "us-east-1"
  }

  # El frontend no habla con AWS: todo lo hace a través de la API.
  permisos = []
}

output "servicio" { value = module.servicio.servicio_nombre }
output "log_group" { value = module.servicio.log_group }
output "url" { value = data.terraform_remote_state.edge.outputs.url }
