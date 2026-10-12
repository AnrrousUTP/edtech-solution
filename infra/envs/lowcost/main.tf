terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  # Este estado vive separado del entorno dev. No referencia ni administra recursos
  # del estado anterior; el backend se configura al inicializar con -backend-config.
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project   = "edtech"
      Env       = "lowcost"
      ManagedBy = "terraform"
    }
  }
}

locals {
  public_mode              = !var.pause_public_services && var.operation_mode == "publico"
  workers_enabled          = local.public_mode && var.enable_workers && var.worker_release_ready
  payments_enabled         = local.public_mode && contains(local.ready_api_domains, "payments")
  payments_workers_enabled = local.payments_enabled && local.workers_enabled
  outbox_enabled           = local.public_mode && var.enable_outbox_publisher && contains(local.ready_api_domains, "payments") && contains(local.ready_api_domains, "affiliates")
  outbox_domains           = setintersection(local.lambda_domains, toset(["payments", "affiliates", "iot-terminals"]))
  ai_enabled               = local.public_mode && var.enable_ai
  iot_enabled              = local.public_mode && var.enable_iot && local.workers_enabled && contains(local.ready_api_domains, "iot-terminals")
  affiliate_events_enabled = local.public_mode && var.enable_affiliate_events && contains(local.ready_api_domains, "affiliates")
  # El primer despliegue público solo necesita el recorrido QR → compra → comisión → terminal.
  # Los otros dominios se agregan explícitamente en una fase posterior.
  domains           = setunion(var.enabled_domains, toset(["control"]))
  lambda_domains    = setsubtract(local.domains, toset(["control"]))
  ready_api_domains = setintersection(local.lambda_domains, var.ready_api_domains)
  artifact_bucket   = var.lambda_artifact_bucket != "" ? var.lambda_artifact_bucket : aws_s3_bucket.content.bucket
  api_prefixes = {
    "identity-access"     = "/api/identity/{proxy+}"
    "catalog"             = "/api/catalog/{proxy+}"
    "enrollment-progress" = "/api/enrollment/{proxy+}"
    "gamification"        = "/api/gamification/{proxy+}"
    "flashcards"          = "/api/flashcards/{proxy+}"
    "payments"            = "/api/payments/{proxy+}"
    "affiliates"          = "/api/affiliates/{proxy+}"
    "iot-terminals"       = "/api/iot/{proxy+}"
  }
}

resource "aws_dynamodb_table" "domain" {
  for_each     = local.domains
  name         = "edtech-lowcost-${each.key}"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "PK"
  range_key = "SK"

  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }
  attribute {
    name = "GSI1PK"
    type = "S"
  }
  attribute {
    name = "GSI1SK"
    type = "S"
  }
  attribute {
    name = "GSI2PK"
    type = "S"
  }
  attribute {
    name = "GSI2SK"
    type = "S"
  }

  global_secondary_index {
    name = "GSI1"
    key_schema {
      attribute_name = "GSI1PK"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "GSI1SK"
      key_type       = "RANGE"
    }
    projection_type = "ALL"
  }
  global_secondary_index {
    name = "GSI2"
    key_schema {
      attribute_name = "GSI2PK"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "GSI2SK"
      key_type       = "RANGE"
    }
    projection_type = "ALL"
  }

  stream_enabled   = each.key != "control"
  stream_view_type = each.key != "control" ? "NEW_AND_OLD_IMAGES" : null

  server_side_encryption { enabled = true }
  point_in_time_recovery { enabled = var.enable_point_in_time_recovery }
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
  deletion_protection_enabled = true
  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket" "content" {
  bucket        = var.content_bucket_name
  force_destroy = false
}
resource "aws_s3_bucket_public_access_block" "content" {
  bucket                  = aws_s3_bucket.content.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_cors_configuration" "content" {
  count  = length(var.allowed_origins) > 0 ? 1 : 0
  bucket = aws_s3_bucket.content.id
  cors_rule {
    allowed_methods = ["POST"]
    allowed_origins = var.allowed_origins
    allowed_headers = ["content-type", "x-amz-*", "x-amz-meta-*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 300
  }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "content" {
  bucket = aws_s3_bucket.content.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
resource "aws_s3_bucket_lifecycle_configuration" "content" {
  bucket = aws_s3_bucket.content.id
  rule {
    id     = "expire-temporary-audio"
    status = "Enabled"
    filter { prefix = "temporary-audio/" }
    expiration { days = 1 }
  }
}
resource "aws_s3_bucket_policy" "transcribe_output" {
  bucket = aws_s3_bucket.content.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowTranscribeOutputForThisAccount"
      Effect    = "Allow"
      Principal = { Service = "transcribe.amazonaws.com" }
      Action    = ["s3:PutObject"]
      Resource  = "${aws_s3_bucket.content.arn}/temporary-audio/results/*"
      Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
        ArnLike      = { "aws:SourceArn" = "arn:aws:transcribe:${var.aws_region}:${data.aws_caller_identity.current.account_id}:transcription-job/*" }
      }
      }, {
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = ["s3:*"]
      Resource  = [aws_s3_bucket.content.arn, "${aws_s3_bucket.content.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

data "aws_caller_identity" "current" {}
data "aws_iot_endpoint" "data" { endpoint_type = "iot:Data-ATS" }
data "aws_iam_role" "amplify_execution" {
  count = var.amplify_execution_role_name != "" ? 1 : 0
  name  = var.amplify_execution_role_name
}
locals {
  iot_session_principals = concat(
    [aws_iam_role.lambda["iot-terminals"].arn],
    var.amplify_execution_role_name != "" ? [data.aws_iam_role.amplify_execution[0].arn] : [],
  )
}
resource "aws_iam_role" "iot_browser_session" {
  name = "edtech-lowcost-iot-browser-session"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = local.iot_session_principals }
      Action    = ["sts:AssumeRole", "sts:TagSession"]
      Condition = {
        StringEquals                = { "aws:RequestTag/terminalId" = var.iot_thing_name }
        "ForAllValues:StringEquals" = { "aws:TagKeys" = ["terminalId"] }
      }
    }]
  })
  max_session_duration = 3600
}
resource "aws_iam_role_policy" "iot_browser_session" {
  name = "terminal-scoped-mqtt"
  role = aws_iam_role.iot_browser_session.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["iot:Connect"], Resource = "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:client/edtech-$${aws:PrincipalTag/terminalId}" },
      { Effect = "Allow", Action = ["iot:Publish"], Resource = [
        "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/edtech/lowcost/terminals/$${aws:PrincipalTag/terminalId}/telemetry",
        "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/edtech/lowcost/terminals/$${aws:PrincipalTag/terminalId}/ack",
        "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/$aws/things/$${aws:PrincipalTag/terminalId}/shadow/name/promotion/get",
        "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/$aws/things/$${aws:PrincipalTag/terminalId}/shadow/name/promotion/update"
      ] },
      { Effect = "Allow", Action = ["iot:Subscribe"], Resource = [
        "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topicfilter/edtech/lowcost/terminals/$${aws:PrincipalTag/terminalId}/alerts",
        "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topicfilter/$aws/things/$${aws:PrincipalTag/terminalId}/shadow/name/promotion/*"
      ] },
      { Effect = "Allow", Action = ["iot:Receive"], Resource = [
        "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/edtech/lowcost/terminals/$${aws:PrincipalTag/terminalId}/alerts",
        "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/$aws/things/$${aws:PrincipalTag/terminalId}/shadow/name/promotion/*"
      ] }
    ]
  })
}
resource "aws_iam_role_policy" "iot_assume_session" {
  for_each = local.iot_enabled ? toset(["enabled"]) : toset([])
  name     = "assume-terminal-scoped-session"
  role     = aws_iam_role.lambda["iot-terminals"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = ["sts:AssumeRole", "sts:TagSession"]
      Resource  = aws_iam_role.iot_browser_session.arn
      Condition = { StringEquals = { "aws:RequestTag/terminalId" = var.iot_thing_name } }
    }]
  })
}
resource "aws_iam_role_policy" "amplify_iot_session" {
  for_each = local.iot_enabled && var.amplify_execution_role_name != "" ? toset(["enabled"]) : toset([])
  name     = "edtech-lowcost-iot-browser-session"
  role     = data.aws_iam_role.amplify_execution[0].name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = ["sts:AssumeRole", "sts:TagSession"]
      Resource  = aws_iam_role.iot_browser_session.arn
      Condition = { StringEquals = { "aws:RequestTag/terminalId" = var.iot_thing_name } }
    }]
  })
}

resource "aws_iam_role_policy" "amplify_ai" {
  for_each = local.ai_enabled && var.amplify_execution_role_name != "" ? toset(["enabled"]) : toset([])
  name     = "edtech-lowcost-ai-and-transcription"
  role     = var.amplify_execution_role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["bedrock:InvokeModel"], Resource = "arn:aws:bedrock:${var.aws_region}::foundation-model/amazon.nova-micro-v1:0" },
      { Effect = "Allow", Action = ["transcribe:StartTranscriptionJob", "transcribe:GetTranscriptionJob"], Resource = "*" },
      { Effect = "Allow", Action = ["s3:PutObject", "s3:GetObject"], Resource = "${aws_s3_bucket.content.arn}/temporary-audio/*" },
      { Effect = "Allow", Action = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"], Resource = aws_dynamodb_table.domain["control"].arn }
    ]
  })
}

resource "aws_sqs_queue" "jobs_dlq" {
  name                      = "edtech-lowcost-jobs-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}
resource "aws_sqs_queue" "jobs" {
  name                       = "edtech-lowcost-jobs"
  visibility_timeout_seconds = 210
  message_retention_seconds  = 345600
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.jobs_dlq.arn
    maxReceiveCount     = 4
  })
}
resource "aws_sqs_queue" "payments_webhooks_dlq" {
  count                     = local.payments_enabled ? 1 : 0
  name                      = "edtech-lowcost-payments-webhooks-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}
resource "aws_sqs_queue" "payments_webhooks" {
  count                      = local.payments_enabled ? 1 : 0
  name                       = "edtech-lowcost-payments-webhooks"
  visibility_timeout_seconds = 180
  message_retention_seconds  = 345600
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.payments_webhooks_dlq[0].arn
    maxReceiveCount     = 4
  })
}
resource "aws_sqs_queue" "payments_events_dlq" {
  count                     = local.payments_workers_enabled ? 1 : 0
  name                      = "edtech-lowcost-payments-events-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}
resource "aws_sqs_queue" "payments_events" {
  count                      = local.payments_workers_enabled ? 1 : 0
  name                       = "edtech-lowcost-payments-events"
  visibility_timeout_seconds = 180
  message_retention_seconds  = 345600
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.payments_events_dlq[0].arn
    maxReceiveCount     = 4
  })
}
resource "aws_sqs_queue" "affiliates_dlq" {
  count                     = local.affiliate_events_enabled ? 1 : 0
  name                      = "edtech-lowcost-affiliates-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}
resource "aws_sqs_queue" "affiliates" {
  count                      = local.affiliate_events_enabled ? 1 : 0
  name                       = "edtech-lowcost-affiliates-events"
  visibility_timeout_seconds = 180
  message_retention_seconds  = 345600
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.affiliates_dlq[0].arn
    maxReceiveCount     = 4
  })
}
resource "aws_sqs_queue" "iot_events_dlq" {
  count                     = local.iot_enabled ? 1 : 0
  name                      = "edtech-lowcost-iot-events-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}
resource "aws_sqs_queue" "iot_events" {
  count                      = local.iot_enabled ? 1 : 0
  name                       = "edtech-lowcost-iot-events"
  visibility_timeout_seconds = 180
  message_retention_seconds  = 345600
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.iot_events_dlq[0].arn
    maxReceiveCount     = 4
  })
}
resource "aws_iam_role" "iot_rule" {
  name = "edtech-lowcost-iot-rule"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "iot.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}
resource "aws_iam_role_policy" "iot_rule" {
  count = local.iot_enabled ? 1 : 0
  name  = "send-terminal-telemetry-to-jobs"
  role  = aws_iam_role.iot_rule.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["sqs:SendMessage"], Resource = aws_sqs_queue.iot_events[0].arn }]
  })
}
resource "aws_iot_topic_rule" "terminal_telemetry" {
  count       = local.iot_enabled ? 1 : 0
  name        = "edtech_lowcost_terminal_telemetry"
  description = "Envía heartbeats y confirmaciones del terminal virtual a la cola de trabajo."
  enabled     = true
  sql         = "SELECT * FROM 'edtech/lowcost/terminals/${var.iot_thing_name}/telemetry'"
  sql_version = "2016-03-23"
  sqs {
    role_arn   = aws_iam_role.iot_rule.arn
    queue_url  = aws_sqs_queue.iot_events[0].url
    use_base64 = false
  }
  depends_on = [aws_iam_role_policy.iot_rule]
}
resource "aws_cloudwatch_event_bus" "main" { name = "edtech-lowcost" }
resource "aws_cloudwatch_event_rule" "jobs" {
  name           = "edtech-lowcost-domain-events"
  event_bus_name = aws_cloudwatch_event_bus.main.name
  state          = local.workers_enabled ? "ENABLED" : "DISABLED"
  event_pattern  = jsonencode({ source = [{ prefix = "edtech." }] })
}
resource "aws_cloudwatch_event_rule" "affiliate_events" {
  count          = local.affiliate_events_enabled ? 1 : 0
  name           = "edtech-lowcost-affiliate-conversions"
  event_bus_name = aws_cloudwatch_event_bus.main.name
  state          = "ENABLED"
  event_pattern = jsonencode({
    "detail-type" = [
      "payments.venta-referida-confirmada.v1",
      "payments.pago-reembolsado.v1",
      "catalog.curso-publicado.v1",
      "catalog.curso-despublicado.v1",
    ]
  })
}
resource "aws_cloudwatch_event_rule" "iot_affiliate_events" {
  count          = local.iot_enabled ? 1 : 0
  name           = "edtech-lowcost-terminal-affiliate-events"
  event_bus_name = aws_cloudwatch_event_bus.main.name
  state          = local.iot_enabled ? "ENABLED" : "DISABLED"
  event_pattern = jsonencode({
    "detail-type" = [
      "affiliates.afiliado-activado.v1",
      "affiliates.comision-registrada.v1",
    ]
  })
}
resource "aws_cloudwatch_event_target" "iot_affiliate_events" {
  count          = local.iot_enabled ? 1 : 0
  rule           = aws_cloudwatch_event_rule.iot_affiliate_events[0].name
  event_bus_name = aws_cloudwatch_event_bus.main.name
  target_id      = "terminal-events-queue"
  arn            = aws_sqs_queue.iot_events[0].arn
  dead_letter_config { arn = aws_sqs_queue.iot_events_dlq[0].arn }
  retry_policy {
    maximum_event_age_in_seconds = 3600
    maximum_retry_attempts       = 2
  }
}
resource "aws_sqs_queue_policy" "iot_affiliate_events" {
  count     = local.iot_enabled ? 1 : 0
  queue_url = aws_sqs_queue.iot_events[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.iot_events[0].arn
      Condition = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.iot_affiliate_events[0].arn } }
    }]
  })
}
resource "aws_cloudwatch_event_target" "affiliate_events" {
  count          = local.affiliate_events_enabled ? 1 : 0
  rule           = aws_cloudwatch_event_rule.affiliate_events[0].name
  event_bus_name = aws_cloudwatch_event_bus.main.name
  target_id      = "affiliates-events-queue"
  arn            = aws_sqs_queue.affiliates[0].arn
  dead_letter_config { arn = aws_sqs_queue.affiliates_dlq[0].arn }
  retry_policy {
    maximum_event_age_in_seconds = 3600
    maximum_retry_attempts       = 2
  }
}
resource "aws_sqs_queue_policy" "affiliate_events" {
  count     = local.affiliate_events_enabled ? 1 : 0
  queue_url = aws_sqs_queue.affiliates[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.affiliates[0].arn
      Condition = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.affiliate_events[0].arn } }
    }]
  })
}
resource "aws_cloudwatch_event_target" "jobs" {
  rule           = aws_cloudwatch_event_rule.jobs.name
  event_bus_name = aws_cloudwatch_event_bus.main.name
  target_id      = "lowcost-jobs-queue"
  arn            = aws_sqs_queue.jobs.arn
  dead_letter_config { arn = aws_sqs_queue.jobs_dlq.arn }
  retry_policy {
    maximum_event_age_in_seconds = 3600
    maximum_retry_attempts       = 2
  }
}
resource "aws_sqs_queue_policy" "jobs_events" {
  queue_url = aws_sqs_queue.jobs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.jobs.arn
      Condition = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.jobs.arn } }
    }]
  })
}
resource "aws_cloudwatch_event_rule" "payments_catalog" {
  count          = local.payments_workers_enabled ? 1 : 0
  name           = "edtech-lowcost-payments-catalog-prices"
  event_bus_name = aws_cloudwatch_event_bus.main.name
  state          = local.payments_workers_enabled ? "ENABLED" : "DISABLED"
  event_pattern = jsonencode({
    "detail-type" = [
      "catalog.curso-publicado.v1",
      "catalog.precio-actualizado.v1",
      "catalog.curso-despublicado.v1",
    ]
  })
}
resource "aws_cloudwatch_event_target" "payments_catalog" {
  count          = local.payments_workers_enabled ? 1 : 0
  rule           = aws_cloudwatch_event_rule.payments_catalog[0].name
  event_bus_name = aws_cloudwatch_event_bus.main.name
  target_id      = "payments-course-price-projection"
  arn            = aws_sqs_queue.payments_events[0].arn
  dead_letter_config { arn = aws_sqs_queue.payments_events_dlq[0].arn }
  retry_policy {
    maximum_event_age_in_seconds = 3600
    maximum_retry_attempts       = 2
  }
}
resource "aws_sqs_queue_policy" "payments_catalog" {
  count     = local.payments_workers_enabled ? 1 : 0
  queue_url = aws_sqs_queue.payments_events[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.payments_events[0].arn
      Condition = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.payments_catalog[0].arn } }
    }]
  })
}

resource "aws_iam_role" "lambda" {
  for_each = local.lambda_domains
  name     = "edtech-lowcost-${each.key}-lambda"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}
resource "aws_iam_role_policy_attachment" "lambda_logs" {
  for_each   = local.lambda_domains
  role       = aws_iam_role.lambda[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
resource "aws_iam_role_policy" "lambda_runtime" {
  for_each = local.lambda_domains
  name     = "runtime"
  role     = aws_iam_role.lambda[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:BatchGetItem", "dynamodb:BatchWriteItem", "dynamodb:TransactWriteItems"]
        Resource = [aws_dynamodb_table.domain[each.key].arn, "${aws_dynamodb_table.domain[each.key].arn}/index/*", aws_dynamodb_table.domain["control"].arn, "${aws_dynamodb_table.domain["control"].arn}/index/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "${aws_s3_bucket.content.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["events:PutEvents"]
        Resource = aws_cloudwatch_event_bus.main.arn
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.jobs.arn
      }
    ]
  })
}
resource "aws_iam_role_policy" "affiliate_signing_parameter" {
  count = local.public_mode && contains(local.ready_api_domains, "affiliates") ? 1 : 0
  name  = "read-referral-signing-parameter"
  role  = aws_iam_role.lambda["affiliates"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameter"]
      Resource = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.referral_signing_parameter_name}"
    }]
  })
}
resource "aws_iam_role_policy" "payments_parameters" {
  count = local.payments_enabled ? 1 : 0
  name  = "read-paypal-and-referral-parameters"
  role  = aws_iam_role.lambda["payments"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["ssm:GetParameter"]
      Resource = [
        "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.paypal_parameter_name}",
        "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.referral_verification_parameter_name}",
      ]
    }]
  })
}

resource "aws_iam_role_policy" "enrollment_catalog_invoke" {
  count = local.public_mode && contains(local.ready_api_domains, "enrollment-progress") ? 1 : 0
  name  = "invoke-private-catalog-tasks"
  role  = aws_iam_role.lambda["enrollment-progress"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:edtech-lowcost-catalog"
    }]
  })
}
resource "aws_iam_role_policy" "payments_webhook_queue" {
  count = local.payments_enabled ? 1 : 0
  name  = "publish-paypal-webhooks"
  role  = aws_iam_role.lambda["payments"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:SendMessage"]
      Resource = aws_sqs_queue.payments_webhooks[0].arn
    }]
  })
}
resource "aws_iam_role_policy" "payments_event_consumer" {
  count = local.payments_workers_enabled ? 1 : 0
  name  = "consume-payment-webhooks-and-catalog-events"
  role  = aws_iam_role.lambda["payments"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
      Resource = [aws_sqs_queue.payments_webhooks[0].arn, aws_sqs_queue.payments_events[0].arn]
    }]
  })
}
resource "aws_iam_role_policy" "flashcards_bedrock" {
  count = local.ai_enabled && contains(local.ready_api_domains, "flashcards") ? 1 : 0
  name  = "invoke-nova-micro-flashcards"
  role  = aws_iam_role.lambda["flashcards"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["bedrock:InvokeModel"]
      Resource = "arn:aws:bedrock:${var.aws_region}::foundation-model/amazon.nova-micro-v1:0"
    }]
  })
}
resource "aws_iam_role_policy" "iot_data_plane" {
  count = local.iot_enabled ? 1 : 0
  name  = "update-terminal-shadow-and-publish-alerts"
  role  = aws_iam_role.lambda["iot-terminals"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["iot:UpdateThingShadow", "iot:Publish"]
      Resource = [
        "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:thing/${var.iot_thing_name}",
        "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/edtech/lowcost/terminals/${var.iot_thing_name}/alerts",
      ]
    }]
  })
}
resource "aws_iam_role_policy" "iot_event_consumer" {
  count = local.iot_enabled ? 1 : 0
  name  = "consume-terminal-events"
  role  = aws_iam_role.lambda["iot-terminals"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
      Resource = aws_sqs_queue.iot_events[0].arn
    }]
  })
}
resource "aws_iam_role_policy" "affiliate_event_consumer" {
  count = local.affiliate_events_enabled ? 1 : 0
  name  = "consume-affiliate-events"
  role  = aws_iam_role.lambda["affiliates"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
      Resource = aws_sqs_queue.affiliates[0].arn
    }]
  })
}

resource "aws_iam_role" "worker" {
  name = "edtech-lowcost-worker-lambda"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}
resource "aws_iam_role_policy_attachment" "worker_logs" {
  role       = aws_iam_role.worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
resource "aws_iam_role_policy" "worker_runtime" {
  name = "runtime"
  role = aws_iam_role.worker.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query", "dynamodb:TransactWriteItems"], Resource = [for table in aws_dynamodb_table.domain : "${table.arn}*"] },
      { Effect = "Allow", Action = ["events:PutEvents"], Resource = aws_cloudwatch_event_bus.main.arn },
      { Effect = "Allow", Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"], Resource = aws_sqs_queue.jobs.arn },
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.content.arn}/*" },
    ]
  })
}
resource "aws_iam_role_policy" "worker_transcribe" {
  count = local.ai_enabled ? 1 : 0
  name  = "process-approved-transcription-jobs"
  role  = aws_iam_role.worker.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["transcribe:StartTranscriptionJob", "transcribe:GetTranscriptionJob", "transcribe:DeleteTranscriptionJob"]
      Resource = "*"
    }]
  })
}
resource "aws_iam_role_policy" "worker_ai" {
  count = local.ai_enabled ? 1 : 0
  name  = "invoke-approved-bedrock-model"
  role  = aws_iam_role.worker.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["bedrock:InvokeModel"]
      Resource = "arn:aws:bedrock:${var.aws_region}::foundation-model/amazon.nova-micro-v1:0"
    }]
  })
}
resource "aws_lambda_function" "worker" {
  count                          = local.workers_enabled ? 1 : 0
  function_name                  = "edtech-lowcost-worker"
  role                           = aws_iam_role.worker.arn
  runtime                        = "nodejs22.x"
  handler                        = "worker.handler"
  architectures                  = ["arm64"]
  memory_size                    = 512
  timeout                        = 180
  s3_bucket                      = local.artifact_bucket
  s3_key                         = "${var.lambda_artifact_prefix}/worker.zip"
  reserved_concurrent_executions = local.workers_enabled ? 1 : 0
  environment {
    variables = {
      NODE_ENV       = "production"
      PERSISTENCE    = "dynamodb"
      CONTROL_TABLE  = aws_dynamodb_table.domain["control"].name
      CONTENT_BUCKET = aws_s3_bucket.content.bucket
      EVENT_BUS_NAME = aws_cloudwatch_event_bus.main.name
      AI_ENABLED     = tostring(local.ai_enabled)
    }
  }
  depends_on = [aws_iam_role_policy_attachment.worker_logs]
}
resource "aws_lambda_event_source_mapping" "jobs" {
  count                              = local.workers_enabled ? 1 : 0
  event_source_arn                   = aws_sqs_queue.jobs.arn
  function_name                      = aws_lambda_function.worker[0].arn
  batch_size                         = 5
  maximum_batching_window_in_seconds = 2
  function_response_types            = ["ReportBatchItemFailures"]
  enabled                            = true
}
resource "aws_lambda_event_source_mapping" "affiliate_events" {
  count                              = local.affiliate_events_enabled ? 1 : 0
  event_source_arn                   = aws_sqs_queue.affiliates[0].arn
  function_name                      = aws_lambda_function.api["affiliates"].arn
  batch_size                         = 5
  function_response_types            = ["ReportBatchItemFailures"]
  maximum_batching_window_in_seconds = 2
  enabled                            = true
  depends_on                         = [aws_sqs_queue_policy.affiliate_events, aws_iam_role_policy.affiliate_event_consumer]
}
resource "aws_lambda_event_source_mapping" "iot_events" {
  count                              = local.iot_enabled ? 1 : 0
  event_source_arn                   = aws_sqs_queue.iot_events[0].arn
  function_name                      = aws_lambda_function.api["iot-terminals"].arn
  batch_size                         = 10
  function_response_types            = ["ReportBatchItemFailures"]
  maximum_batching_window_in_seconds = 1
  enabled                            = true
  scaling_config { maximum_concurrency = 2 }
  depends_on = [
    aws_sqs_queue_policy.iot_affiliate_events,
    aws_iam_role_policy.iot_event_consumer,
  ]
}
resource "aws_lambda_event_source_mapping" "payments_webhooks" {
  count                              = local.payments_workers_enabled ? 1 : 0
  event_source_arn                   = aws_sqs_queue.payments_webhooks[0].arn
  function_name                      = aws_lambda_function.api["payments"].arn
  batch_size                         = 5
  function_response_types            = ["ReportBatchItemFailures"]
  maximum_batching_window_in_seconds = 2
  enabled                            = true
  depends_on                         = [aws_iam_role_policy.payments_event_consumer]
}
resource "aws_lambda_event_source_mapping" "payments_events" {
  count                              = local.payments_workers_enabled ? 1 : 0
  event_source_arn                   = aws_sqs_queue.payments_events[0].arn
  function_name                      = aws_lambda_function.api["payments"].arn
  batch_size                         = 5
  function_response_types            = ["ReportBatchItemFailures"]
  maximum_batching_window_in_seconds = 2
  enabled                            = true
  depends_on = [
    aws_sqs_queue_policy.payments_catalog,
    aws_iam_role_policy.payments_event_consumer,
  ]
}

resource "aws_iam_role" "scheduler" {
  name = "edtech-lowcost-scheduler"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "scheduler.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}
resource "aws_iam_role_policy" "scheduler" {
  count = local.workers_enabled ? 1 : 0
  name  = "invoke-worker"
  role  = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["lambda:InvokeFunction"], Resource = aws_lambda_function.worker[0].arn }]
  })
}
resource "aws_scheduler_schedule" "expire_orders" {
  count                        = local.workers_enabled ? 1 : 0
  name                         = "edtech-lowcost-expire-orders"
  schedule_expression          = "rate(15 minutes)"
  schedule_expression_timezone = "UTC"
  state                        = local.workers_enabled ? "ENABLED" : "DISABLED"
  flexible_time_window { mode = "OFF" }
  target {
    arn      = aws_lambda_function.worker[0].arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ task = "expire-orders" })
    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 2
    }
  }
}
resource "aws_iam_role_policy" "scheduler_payments" {
  count = local.payments_workers_enabled ? 1 : 0
  name  = "invoke-payments-expiration"
  role  = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = aws_lambda_function.api["payments"].arn
    }]
  })
}
resource "aws_scheduler_schedule" "expire_payment_orders" {
  count                        = local.payments_workers_enabled ? 1 : 0
  name                         = "edtech-lowcost-expire-payment-orders"
  schedule_expression          = "rate(15 minutes)"
  schedule_expression_timezone = "UTC"
  state                        = local.payments_workers_enabled ? "ENABLED" : "DISABLED"
  flexible_time_window { mode = "OFF" }
  target {
    arn      = aws_lambda_function.api["payments"].arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ task = "expire-orders" })
    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 2
    }
  }
  depends_on = [aws_iam_role_policy.scheduler_payments]
}

resource "aws_iam_role" "stream_publisher" {
  name = "edtech-lowcost-stream-publisher"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}
resource "aws_iam_role_policy_attachment" "stream_logs" {
  role       = aws_iam_role.stream_publisher.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
resource "aws_iam_role_policy" "stream_publisher" {
  name = "read-stream-publish-events"
  role = aws_iam_role.stream_publisher.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["dynamodb:DescribeStream", "dynamodb:GetRecords", "dynamodb:GetShardIterator", "dynamodb:ListStreams"], Resource = [for domain in local.lambda_domains : aws_dynamodb_table.domain[domain].stream_arn] },
      { Effect = "Allow", Action = ["dynamodb:Query", "dynamodb:UpdateItem"], Resource = [for domain in local.lambda_domains : "${aws_dynamodb_table.domain[domain].arn}*"] },
      { Effect = "Allow", Action = ["events:PutEvents"], Resource = aws_cloudwatch_event_bus.main.arn }
    ]
  })
}
resource "aws_lambda_function" "stream_publisher" {
  count                          = local.outbox_enabled ? 1 : 0
  function_name                  = "edtech-lowcost-outbox-publisher"
  role                           = aws_iam_role.stream_publisher.arn
  runtime                        = "nodejs22.x"
  handler                        = "outbox.handler"
  architectures                  = ["arm64"]
  memory_size                    = 256
  timeout                        = 30
  s3_bucket                      = local.artifact_bucket
  s3_key                         = "${var.lambda_artifact_prefix}/outbox.zip"
  reserved_concurrent_executions = local.outbox_enabled ? -1 : 0
  environment {
    variables = {
      EVENT_BUS_NAME = aws_cloudwatch_event_bus.main.name
      DOMAIN_TABLES  = jsonencode({ for domain in local.lambda_domains : domain => aws_dynamodb_table.domain[domain].name })
    }
  }
  depends_on = [aws_iam_role_policy_attachment.stream_logs]
}
resource "aws_iam_role_policy" "scheduler_outbox" {
  count = local.outbox_enabled ? 1 : 0
  name  = "invoke-outbox-reconciler"
  role  = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["lambda:InvokeFunction"], Resource = aws_lambda_function.stream_publisher[0].arn }]
  })
}
resource "aws_scheduler_schedule" "reconcile_outbox" {
  count                        = local.outbox_enabled ? 1 : 0
  name                         = "edtech-lowcost-reconcile-outbox"
  schedule_expression          = "rate(1 hour)"
  schedule_expression_timezone = "UTC"
  state                        = local.outbox_enabled ? "ENABLED" : "DISABLED"
  flexible_time_window { mode = "OFF" }
  target {
    arn      = aws_lambda_function.stream_publisher[0].arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ task = "reconcile-outbox" })
    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 2
    }
  }
}
resource "aws_lambda_event_source_mapping" "outbox" {
  for_each                       = local.outbox_enabled ? local.outbox_domains : toset([])
  event_source_arn               = aws_dynamodb_table.domain[each.key].stream_arn
  function_name                  = aws_lambda_function.stream_publisher[0].arn
  starting_position              = "LATEST"
  batch_size                     = 10
  function_response_types        = ["ReportBatchItemFailures"]
  maximum_retry_attempts         = 3
  bisect_batch_on_function_error = true
  maximum_record_age_in_seconds  = 3600
}

resource "aws_lambda_function" "api" {
  for_each      = local.public_mode ? local.ready_api_domains : toset([])
  function_name = "edtech-lowcost-${each.key}"
  role          = aws_iam_role.lambda[each.key].arn
  runtime       = "nodejs22.x"
  handler       = "handler.handler"
  architectures = ["arm64"]
  memory_size   = each.key == "flashcards" ? 512 : 256
  timeout       = each.key == "flashcards" ? 180 : 30

  s3_bucket = local.artifact_bucket
  s3_key    = "${var.lambda_artifact_prefix}/${each.key}.zip"

  reserved_concurrent_executions = local.public_mode ? -1 : 0
  environment {
    variables = {
      NODE_ENV                             = "production"
      PERSISTENCE                          = "dynamodb"
      DOMAIN                               = each.key
      DYNAMODB_TABLE                       = aws_dynamodb_table.domain[each.key].name
      COGNITO_ISSUER                       = var.cognito_issuer
      COGNITO_CLIENT_ID                    = var.cognito_client_id
      COGNITO_JWKS_URI                     = var.cognito_jwks_uri
      REFERRAL_SIGNING_PARAMETER_NAME      = each.key == "affiliates" ? var.referral_signing_parameter_name : ""
      REFERRAL_VERIFICATION_PARAMETER_NAME = each.key == "payments" ? var.referral_verification_parameter_name : ""
      PAYPAL_MODE                          = each.key == "payments" ? "real" : ""
      PAYPAL_PARAMETER_NAME                = each.key == "payments" ? var.paypal_parameter_name : ""
      QUEUE_WEBHOOKS_URL                   = each.key == "payments" ? aws_sqs_queue.payments_webhooks[0].url : ""
      CONTROL_TABLE                        = aws_dynamodb_table.domain["control"].name
      CONTENT_BUCKET                       = aws_s3_bucket.content.bucket
      EVENT_BUS_NAME                       = aws_cloudwatch_event_bus.main.name
      JOBS_QUEUE_URL                       = aws_sqs_queue.jobs.url
      LOWCOST_MODE                         = var.operation_mode
      AI_ENABLED                           = tostring(local.ai_enabled)
      IOT_ENABLED                          = tostring(local.iot_enabled)
      IOT_DATA_ENDPOINT                    = each.key == "iot-terminals" ? "https://${data.aws_iot_endpoint.data.endpoint_address}" : ""
      IOT_SESSION_ROLE                     = each.key == "iot-terminals" ? aws_iam_role.iot_browser_session.arn : ""
      IOT_DEVICE_ID                        = each.key == "iot-terminals" ? var.iot_thing_name : ""
      IOT_TOPIC_PREFIX                     = each.key == "iot-terminals" ? "edtech/lowcost" : "edtech/dev"
      BEDROCK_MODEL_ID                     = each.key == "flashcards" ? "amazon.nova-micro-v1:0" : ""
      CATALOG_FUNCTION_NAME                = each.key == "enrollment-progress" ? "edtech-lowcost-catalog" : ""
    }
  }
  lifecycle {
    precondition {
      condition     = startswith(var.cognito_issuer, "https://") && var.cognito_client_id != "" && startswith(var.cognito_jwks_uri, "https://")
      error_message = "Configura issuer HTTPS, client ID y JWKS HTTPS de Cognito antes de habilitar una API."
    }
  }
  depends_on = [
    aws_iam_role_policy_attachment.lambda_logs,
    aws_iam_role_policy.affiliate_signing_parameter,
    aws_iam_role_policy.payments_parameters,
    aws_iam_role_policy.payments_webhook_queue,
    aws_iam_role_policy.iot_data_plane,
    aws_iam_role_policy.enrollment_catalog_invoke,
  ]
}

resource "aws_cloudwatch_log_group" "lambda" {
  for_each          = local.lambda_domains
  name              = "/aws/lambda/edtech-lowcost-${each.key}"
  retention_in_days = 7
}

resource "aws_apigatewayv2_api" "http" {
  name          = "edtech-lowcost-http"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["authorization", "content-type", "x-request-id"]
    max_age       = 600
  }
}
resource "aws_apigatewayv2_stage" "http" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
  default_route_settings {
    throttling_rate_limit  = 5
    throttling_burst_limit = 10
  }
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api.arn
    format          = jsonencode({ requestId = "$context.requestId", routeKey = "$context.routeKey", status = "$context.status", responseLength = "$context.responseLength" })
  }
}

# La app y su conexión GitHub se crean con autorización de la propietaria y se
# importan en este estado. Amplify conserva la conexión OAuth fuera del estado
# Terraform. La rama queda controlada aquí y no compila mientras siga pausada.
resource "aws_amplify_app" "production" {
  count      = var.amplify_app_id != "" ? 1 : 0
  name       = "edtech-solution"
  repository = "https://github.com/AnrrousUTP/edtech-solution"
  platform   = "WEB_COMPUTE"
  build_spec = file("${path.module}/../../../amplify.yml")
  environment_variables = {
    AMPLIFY_DIFF_DEPLOY       = "false"
    AMPLIFY_MONOREPO_APP_ROOT = "apps/web"
  }

  enable_branch_auto_build    = false
  enable_branch_auto_deletion = false
  enable_auto_branch_creation = false
  enable_basic_auth           = false
  iam_service_role_arn        = var.amplify_execution_role_name != "" ? data.aws_iam_role.amplify_execution[0].arn : null

  custom_rule {
    source = "/<*>"
    target = "/index.html"
    status = "404-200"
  }
}

resource "aws_amplify_branch" "production" {
  count        = var.amplify_app_id != "" && var.amplify_default_domain != "" ? 1 : 0
  app_id       = aws_amplify_app.production[0].id
  branch_name  = var.amplify_branch_name
  display_name = "main"
  description  = "EdTech · rama pública"
  framework    = "Next.js - SSR"
  stage        = "PRODUCTION"

  enable_auto_build           = local.public_mode
  enable_pull_request_preview = false
  enable_performance_mode     = false
  environment_variables = {
    API_BASE                    = aws_apigatewayv2_api.http.api_endpoint
    EDTECH_SERVICES_API_BASE    = aws_apigatewayv2_api.http.api_endpoint
    NEXT_PUBLIC_API_BASE        = aws_apigatewayv2_api.http.api_endpoint
    APP_URL                     = "https://${var.amplify_branch_name}.${var.amplify_default_domain}"
    COGNITO_REGION              = var.aws_region
    COGNITO_DOMINIO             = var.cognito_domain
    COGNITO_CLIENT_ID           = var.cognito_client_id
    EDTECH_AFFILIATES_ENABLED   = tostring(local.public_mode && contains(local.ready_api_domains, "affiliates"))
    EDTECH_AI_ENABLED           = tostring(local.ai_enabled)
    EDTECH_CONTROL_TABLE        = aws_dynamodb_table.domain["control"].name
    EDTECH_AUDIO_BUCKET         = aws_s3_bucket.content.bucket
    EDTECH_IOT_ENABLED          = tostring(local.iot_enabled)
    EDTECH_IOT_DATA_ENDPOINT    = "https://${data.aws_iot_endpoint.data.endpoint_address}"
    EDTECH_IOT_SESSION_ROLE_ARN = aws_iam_role.iot_browser_session.arn
    EDTECH_IOT_THING_NAME       = var.iot_thing_name
    BEDROCK_MODEL_ID            = "amazon.nova-micro-v1:0"
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/apigateway/edtech-lowcost"
  retention_in_days = 7
}
resource "aws_lambda_permission" "api" {
  for_each      = local.public_mode ? local.ready_api_domains : toset([])
  statement_id  = "AllowHttpApiInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}
resource "aws_apigatewayv2_integration" "api" {
  for_each               = local.public_mode ? local.ready_api_domains : toset([])
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api[each.key].invoke_arn
  payload_format_version = "2.0"
}
resource "aws_apigatewayv2_route" "api" {
  for_each  = { for domain, prefix in local.api_prefixes : domain => prefix if local.public_mode && contains(local.ready_api_domains, domain) }
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "ANY ${each.value}"
  target    = "integrations/${aws_apigatewayv2_integration.api[each.key].id}"
}

resource "aws_budgets_budget" "project" {
  name         = "edtech-lowcost-monthly"
  budget_type  = "COST"
  limit_amount = "4"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  # Mide consumo bruto etiquetado antes de que los créditos reduzcan la factura.
  cost_types { include_credit = false }
  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Project$edtech"]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_notification_emails
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_notification_emails
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.budget_notification_emails
  }
}
