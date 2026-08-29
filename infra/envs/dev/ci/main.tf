# Rol que asume GitHub Actions por OIDC (doc 12 §8). No hay ninguna clave larga
# en los secrets del repositorio: una AWS_ACCESS_KEY_ID en GitHub es una fuga
# esperando ocurrir.
#
# El rol despliega `dev` y nada más: aplicar `prod` exige credenciales que el
# pipeline no tiene (D16).
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    bucket         = "edtech-tfstate-047600599757"
    key            = "dev/ci/terraform.tfstate"
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

variable "repositorio" {
  description = "owner/repo de GitHub que puede asumir el rol"
  type        = string
  default     = "AnrrousUTP/edtech-solution"
}

data "aws_caller_identity" "actual" {}

locals {
  cuenta = data.aws_caller_identity.actual.account_id
}

# El proveedor OIDC de GitHub es único por cuenta; si ya existe, se importa.
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_role" "ci" {
  name = "edtech-dev-ci"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        # Solo main y solo ESTE repositorio: un fork no puede asumirlo
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.repositorio}:ref:refs/heads/main"
        }
      }
    }]
  })
}

# Empujar imágenes y desplegar dev. Se enumera por servicio en vez de dar "*"
# porque el pipeline no tiene por qué poder tocar otras cosas de la cuenta.
resource "aws_iam_role_policy" "ci" {
  name = "desplegar-dev"
  role = aws_iam_role.ci.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload", "ecr:PutImage", "ecr:UploadLayerPart",
          "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:DescribeImages",
        ]
        Resource = "arn:aws:ecr:us-east-1:${local.cuenta}:repository/edtech/*"
      },
      {
        # El state y su lock
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
        Resource = [
          "arn:aws:s3:::edtech-tfstate-${local.cuenta}",
          "arn:aws:s3:::edtech-tfstate-${local.cuenta}/dev/*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
        Resource = "arn:aws:dynamodb:us-east-1:${local.cuenta}:table/edtech-tflock"
      },
      {
        # Lo que toca el módulo `service` al desplegar una versión nueva
        Effect = "Allow"
        Action = [
          "ecs:RegisterTaskDefinition", "ecs:DeregisterTaskDefinition",
          "ecs:DescribeTaskDefinition", "ecs:UpdateService", "ecs:DescribeServices",
          "ecs:DescribeClusters", "ecs:TagResource",
          "elasticloadbalancing:Describe*", "elasticloadbalancing:ModifyRule",
          "logs:DescribeLogGroups", "logs:ListTagsForResource",
          "iam:GetRole", "iam:PassRole", "iam:GetRolePolicy",
          "application-autoscaling:Describe*", "application-autoscaling:RegisterScalableTarget",
          "application-autoscaling:PutScalingPolicy",
        ]
        Resource = "*"
      },
      {
        # plan-prod: leer el state de prod, jamás escribirlo (D16)
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "arn:aws:s3:::edtech-tfstate-${local.cuenta}/prod/*"
      },
    ]
  })
}

output "rol_ci_arn" { value = aws_iam_role.ci.arn }
