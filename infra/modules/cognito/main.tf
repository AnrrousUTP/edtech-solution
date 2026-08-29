# User Pool, grupos, app clients y las 2 Lambdas (doc 08).
variable "entorno" { type = string }
variable "cola_identity_arn" { type = string }
variable "cola_identity_url" { type = string }
variable "kms_mensajeria_arn" { type = string }
variable "ruta_lambdas" { type = string } # services/identity-access/lambdas
variable "callback_urls" {
  type    = list(string)
  default = ["http://localhost:3000/api/auth/callback"]
}
variable "logout_urls" {
  type    = list(string)
  default = ["http://localhost:3000/"]
}

# Federación con Google (doc 08 §1). Las credenciales son de una app de Google
# Cloud del operador, así que no pueden salir de Terraform ni de un default:
# llegan del secreto `edtech/<entorno>/google-oidc` cuando exista. Sin él, el
# IdP no se crea y el Hosted UI solo ofrece usuario y contraseña.
variable "habilitar_google" {
  description = "true cuando edtech/<entorno>/google-oidc tenga client_id y client_secret"
  type        = bool
  default     = false
}

data "aws_caller_identity" "actual" {}

locals {
  proveedores = var.habilitar_google ? ["COGNITO", "Google"] : ["COGNITO"]
}

# El secreto lo crea el operador con las credenciales de su app de Google; acá
# solo se lee. Nunca se escribe una credencial en el .tf (D17).
data "aws_secretsmanager_secret_version" "google" {
  count     = var.habilitar_google ? 1 : 0
  secret_id = "edtech/${var.entorno}/google-oidc"
}

resource "aws_cognito_identity_provider" "google" {
  count         = var.habilitar_google ? 1 : 0
  user_pool_id  = aws_cognito_user_pool.principal.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id                     = jsondecode(data.aws_secretsmanager_secret_version.google[0].secret_string).client_id
    client_secret                 = jsondecode(data.aws_secretsmanager_secret_version.google[0].secret_string).client_secret
    authorize_scopes              = "openid email profile"
    attributes_url_add_attributes = "true"
  }

  # El post-confirmation espera el email: sin este mapeo, un alta por Google
  # llegaría sin correo y el perfil de identity nacería incompleto.
  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    name           = "name"
    username       = "sub"
  }
}

# ── Lambdas ──────────────────────────────────────────────────────────────────
data "archive_file" "post_confirmation" {
  type        = "zip"
  source_dir  = "${var.ruta_lambdas}/post-confirmation"
  output_path = "${path.module}/.build/post-confirmation.zip"
}

data "archive_file" "pre_token" {
  type        = "zip"
  source_dir  = "${var.ruta_lambdas}/pre-token"
  output_path = "${path.module}/.build/pre-token.zip"
}

resource "aws_iam_role" "lambda" {
  for_each = toset(["post-confirmation", "pre-token"])
  name     = "edtech-${var.entorno}-cognito-${each.value}"
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
  for_each   = aws_iam_role.lambda
  role       = each.value.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "post_confirmation_sqs" {
  name = "encolar-alta"
  role = aws_iam_role.lambda["post-confirmation"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["sqs:SendMessage"], Resource = var.cola_identity_arn },
      { Effect = "Allow", Action = ["kms:GenerateDataKey", "kms:Decrypt"], Resource = var.kms_mensajeria_arn },
    ]
  })
}

resource "aws_iam_role_policy" "pre_token_cognito" {
  name = "consultar-mfa"
  role = aws_iam_role.lambda["pre-token"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["cognito-idp:AdminGetUser"]
      Resource = "arn:aws:cognito-idp:us-east-1:${data.aws_caller_identity.actual.account_id}:userpool/*"
    }]
  })
}

resource "aws_lambda_function" "post_confirmation" {
  function_name    = "edtech-${var.entorno}-cognito-post-confirmation"
  role             = aws_iam_role.lambda["post-confirmation"].arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.post_confirmation.output_path
  source_code_hash = data.archive_file.post_confirmation.output_base64sha256
  timeout          = 10
  environment {
    variables = { QUEUE_URL = var.cola_identity_url }
  }
}

resource "aws_lambda_function" "pre_token" {
  function_name    = "edtech-${var.entorno}-cognito-pre-token"
  role             = aws_iam_role.lambda["pre-token"].arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.pre_token.output_path
  source_code_hash = data.archive_file.pre_token.output_base64sha256
  timeout          = 10
}

# ── User Pool ────────────────────────────────────────────────────────────────
resource "aws_cognito_user_pool" "principal" {
  name = "edtech-${var.entorno}-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 10
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  schema {
    name                = "nombre_visible"
    attribute_data_type = "String"
    mutable             = true
    string_attribute_constraints {
      min_length = 0
      max_length = 80
    }
  }

  lambda_config {
    post_confirmation    = aws_lambda_function.post_confirmation.arn
    pre_token_generation = aws_lambda_function.pre_token.arn
  }

  mfa_configuration = "OPTIONAL"
  software_token_mfa_configuration {
    enabled = true
  }
}

resource "aws_lambda_permission" "cognito_post_confirmation" {
  statement_id  = "CognitoPostConfirmation"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.post_confirmation.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.principal.arn
}

resource "aws_lambda_permission" "cognito_pre_token" {
  statement_id  = "CognitoPreToken"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_token.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.principal.arn
}

resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.principal.id
  precedence   = 1
}

resource "aws_cognito_user_group" "estudiante" {
  name         = "estudiante"
  user_pool_id = aws_cognito_user_pool.principal.id
  precedence   = 10
}

resource "aws_cognito_user_pool_domain" "hosted_ui" {
  domain       = "edtech-${var.entorno}-${data.aws_caller_identity.actual.account_id}"
  user_pool_id = aws_cognito_user_pool.principal.id
}

# App client de la web: público, Authorization Code + PKCE, sin USER_PASSWORD_AUTH
resource "aws_cognito_user_pool_client" "web" {
  name         = "edtech-${var.entorno}-web"
  user_pool_id = aws_cognito_user_pool.principal.id

  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "profile", "email"]
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls
  supported_identity_providers         = local.proveedores
  # Con la rotación activada, Cognito PROHIBE ALLOW_REFRESH_TOKEN_AUTH: el
  # refresh pasa por el endpoint de token del Hosted UI, que es justo por donde
  # lo hace el Route Handler del servidor (doc 08 §7).
  explicit_auth_flows                  = []

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  # Rotación de refresh (doc 08 §5): cada uso devuelve un refresh nuevo y
  # invalida el anterior, así que un refresh robado sirve una sola vez —y su
  # reutilización delata el robo. La gracia de 60 s evita que una petición que
  # se reintenta por un corte de red deje al usuario fuera.
  refresh_token_rotation {
    feature                     = "ENABLED"
    retry_grace_period_seconds  = 60
  }
}

# Client SOLO para verificación automatizada (A-16): admin-initiate-auth requiere
# credenciales IAM del operador; no se usa desde ningún frontend.
resource "aws_cognito_user_pool_client" "pruebas" {
  name                = "edtech-${var.entorno}-pruebas"
  user_pool_id        = aws_cognito_user_pool.principal.id
  generate_secret     = false
  explicit_auth_flows = ["ALLOW_ADMIN_USER_PASSWORD_AUTH"]

  # El cliente de pruebas rota igual: si no, la verificación de F12 estaría
  # comprobando un comportamiento que el cliente real no tiene.
  refresh_token_rotation {
    feature                    = "ENABLED"
    retry_grace_period_seconds = 60
  }
}

output "user_pool_id" { value = aws_cognito_user_pool.principal.id }
output "user_pool_arn" { value = aws_cognito_user_pool.principal.arn }
output "issuer" { value = "https://cognito-idp.us-east-1.amazonaws.com/${aws_cognito_user_pool.principal.id}" }
output "client_web_id" { value = aws_cognito_user_pool_client.web.id }
output "client_pruebas_id" { value = aws_cognito_user_pool_client.pruebas.id }
output "hosted_ui_dominio" { value = "https://${aws_cognito_user_pool_domain.hosted_ui.domain}.auth.us-east-1.amazoncognito.com" }
