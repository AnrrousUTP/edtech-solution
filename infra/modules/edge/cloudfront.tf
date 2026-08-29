# CloudFront + WAF del doc 07 §4/§10, escrito y listo pero NO aplicado:
# `habilitar_cloudfront = false` mientras AWS no verifique la cuenta (A-34).
# Mismo patrón de guarda que `prod` (D16): el código existe, el apply no ocurre.

resource "aws_wafv2_web_acl" "edge" {
  count    = var.habilitar_cloudfront ? 1 : 0
  provider = aws.us_east_1
  name     = "edtech-${var.entorno}-waf"
  scope    = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "comunes"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "comunes"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "malas-entradas"
    priority = 2
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "malas-entradas"
      sampled_requests_enabled   = true
    }
  }

  # Rate limit por IP, EXCLUYENDO el webhook de PayPal (doc 07 §10): PayPal
  # reintenta desde un rango acotado y limitarlo perdería confirmaciones de pago.
  # Su protección es la verificación de firma, que es la correcta para ese caso.
  rule {
    name     = "rate-limit"
    priority = 3
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
        scope_down_statement {
          not_statement {
            statement {
              byte_match_statement {
                search_string         = "/api/payments/webhook"
                positional_constraint = "STARTS_WITH"
                field_to_match {
                  uri_path {}
                }
                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "edtech-${var.entorno}-waf"
    sampled_requests_enabled   = true
  }
}

resource "aws_cloudfront_origin_access_control" "estaticos" {
  count                             = var.habilitar_cloudfront ? 1 : 0
  name                              = "edtech-${var.entorno}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "principal" {
  count           = var.habilitar_cloudfront ? 1 : 0
  enabled         = true
  comment         = "edtech-${var.entorno}"
  price_class     = "PriceClass_100"
  web_acl_id      = aws_wafv2_web_acl.edge[0].arn
  is_ipv6_enabled = true

  origin {
    origin_id   = "alb"
    domain_name = var.alb_dns
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only" # A-22: el ALB de dev es HTTP
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  origin {
    origin_id                = "estaticos"
    domain_name              = var.bucket_estaticos_domain
    origin_access_control_id = aws_cloudfront_origin_access_control.estaticos[0].id
  }

  default_cache_behavior {
    target_origin_id       = "estaticos"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "alb"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
    origin_request_policy_id = "216adef6-5c7f-47e4-b989-5492eafa07d3" # Managed-AllViewer
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_s3_bucket_policy" "estaticos" {
  count  = var.habilitar_cloudfront ? 1 : 0
  bucket = var.bucket_estaticos
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${var.bucket_estaticos_arn}/*"
      Condition = {
        StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.principal[0].arn }
      }
    }]
  })
}
