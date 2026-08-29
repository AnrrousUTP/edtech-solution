# El clúster Aurora dev se crea con tools/aws/crear-aurora.sh (Express
# Configuration, único modo que permite la cuenta FREE — A-08 en DECISIONS.md):
# fuera de VPC, IAM DB auth exclusiva, master "postgres", sin Data API.
# Este módulo gestiona lo que Terraform SÍ puede: los secretos de conexión por
# servicio (sin contraseña: la credencial es el token IAM que firma cada task
# role con rds-db:connect sobre SU usuario — refuerza I-4).
variable "entorno" { type = string }
variable "cluster_identifier" {
  type    = string
  default = "edtech-dev-aurora"
}

data "aws_rds_cluster" "aurora" {
  cluster_identifier = var.cluster_identifier
}

locals {
  servicios = ["identity", "catalog", "enrollment", "gamification", "flashcards", "payments"]
}

resource "aws_secretsmanager_secret" "svc" {
  for_each                = toset(local.servicios)
  name                    = "edtech/${var.entorno}/db/${each.value}"
  recovery_window_in_days = 0
  tags                    = { Service = each.value }
}

resource "aws_secretsmanager_secret_version" "svc" {
  for_each  = toset(local.servicios)
  secret_id = aws_secretsmanager_secret.svc[each.value].id
  secret_string = jsonencode({
    username = "svc_${each.value}"
    host     = data.aws_rds_cluster.aurora.endpoint
    port     = "5432"
    dbname   = "edtech"
    auth     = "iam" # el password se firma en runtime con @aws-sdk/rds-signer
  })
}

output "cluster_arn" { value = data.aws_rds_cluster.aurora.arn }
output "cluster_endpoint" { value = data.aws_rds_cluster.aurora.endpoint }
output "cluster_resource_id" { value = data.aws_rds_cluster.aurora.cluster_resource_id }
output "secretos_db" {
  value = { for s in local.servicios : s => aws_secretsmanager_secret.svc[s].arn }
}
