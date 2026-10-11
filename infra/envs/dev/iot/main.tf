terraform {
  required_version = ">= 1.5"
  required_providers { aws = { source = "hashicorp/aws", version = "~> 6.0" } }
  backend "s3" {
    bucket         = "edtech-tfstate-047600599757"
    key            = "dev/iot/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "edtech-tflock"
  }
}

provider "aws" {
  region = "us-east-1"
  default_tags { tags = { Project = "edtech", Env = "dev", Service = "iot", ManagedBy = "terraform" } }
}

locals { estado = { bucket = "edtech-tfstate-047600599757", region = "us-east-1" } }
data "terraform_remote_state" "messaging" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/messaging/terraform.tfstate" })
}
data "terraform_remote_state" "security" {
  backend = "s3"
  config  = merge(local.estado, { key = "dev/security/terraform.tfstate" })
}
data "aws_iot_endpoint" "data" { endpoint_type = "iot:Data-ATS" }

resource "aws_iot_thing_type" "terminal" { name = "edtech-dev-affiliate-terminal" }
resource "aws_iot_thing" "demo" {
  name            = "terminal-demo-01"
  thing_type_name = aws_iot_thing_type.terminal.name
  attributes      = { purpose = "affiliate-commission-demo", managed_by = "terraform" }
}

resource "aws_iam_role" "rule" {
  name = "edtech-dev-iot-telemetry-rule"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "iot.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}
resource "aws_iam_role_policy" "rule" {
  name = "send-telemetry-to-queue"
  role = aws_iam_role.rule.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["sqs:SendMessage"], Resource = data.terraform_remote_state.messaging.outputs.colas["iot-telemetry"].arn },
      { Effect = "Allow", Action = ["kms:GenerateDataKey", "kms:Decrypt"], Resource = data.terraform_remote_state.security.outputs.kms_mensajeria_arn }
    ]
  })
}
resource "aws_iot_topic_rule" "telemetry" {
  name        = "edtech_dev_terminal_telemetry"
  description = "Envía telemetría del simulador IoT a la cola interna"
  enabled     = false # modo pausado: la regla no procesa tráfico hasta activar la demo
  sql         = "SELECT * FROM 'edtech/dev/terminals/terminal-demo-01/telemetry'"
  sql_version = "2016-03-23"
  sqs {
    role_arn   = aws_iam_role.rule.arn
    queue_url  = data.terraform_remote_state.messaging.outputs.colas["iot-telemetry"].url
    use_base64 = false
  }
}

output "iot_data_endpoint" { value = "https://${data.aws_iot_endpoint.data.endpoint_address}" }
output "thing_name" { value = aws_iot_thing.demo.name }
output "telemetry_rule_arn" { value = aws_iot_topic_rule.telemetry.arn }
