# Borde HTTPS de dev.
#
# HALLAZGO (A-34): esta cuenta NO puede crear distribuciones de CloudFront
# ("Your account must be verified before you can add new CloudFront resources").
# Es un límite de la cuenta, no del plan. El webhook de PayPal exige HTTPS y el
# ALB de dev es HTTP (A-22), así que la terminación TLS la da un **HTTP API en
# modo proxy** hacia el ALB: mismo rol de borde, mismo paso de headers y cuerpo
# crudo (que es lo que la firma de PayPal necesita), sin cambiar la entrada HTTP
# de los servicios — el ALB con listener rules sigue siendo la entrada (D10).
#
# El CloudFront + WAF del doc 07 queda escrito en cloudfront.tf, detrás de
# `habilitar_cloudfront = false`, para aplicarse en cuanto AWS verifique la
# cuenta. Es el mismo patrón que el plan usa para `prod` (D16).
terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 6.0"
      configuration_aliases = [aws.us_east_1]
    }
  }
}

variable "entorno" { type = string }
variable "alb_dns" { type = string }
variable "bucket_estaticos" { type = string }
variable "bucket_estaticos_arn" { type = string }
variable "bucket_estaticos_domain" { type = string }
variable "habilitar_cloudfront" {
  type    = bool
  default = false # A-34: requiere verificación de la cuenta por AWS Support
}

# ── Terminación TLS: HTTP API en modo proxy hacia el ALB ─────────────────────
resource "aws_apigatewayv2_api" "tls" {
  name          = "edtech-${var.entorno}-tls"
  protocol_type = "HTTP"
  description   = "Terminación TLS del borde de dev (A-34); proxy transparente al ALB"
}

resource "aws_apigatewayv2_integration" "alb" {
  api_id                 = aws_apigatewayv2_api.tls.id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  integration_uri        = "http://${var.alb_dns}/{proxy}"
  payload_format_version = "1.0"
  timeout_milliseconds   = 29000
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.tls.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.alb.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.tls.id
  name        = "$default"
  auto_deploy = true
}

output "url" {
  value = var.habilitar_cloudfront ? "https://${aws_cloudfront_distribution.principal[0].domain_name}" : aws_apigatewayv2_stage.default.invoke_url
}

output "dominio" {
  value = var.habilitar_cloudfront ? aws_cloudfront_distribution.principal[0].domain_name : replace(replace(aws_apigatewayv2_stage.default.invoke_url, "https://", ""), "/", "")
}

output "usando_cloudfront" { value = var.habilitar_cloudfront }
