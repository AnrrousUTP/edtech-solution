# Buckets media (privado, OAC llega con edge en F10) y estáticos (doc 07 §4).
variable "entorno" { type = string }
variable "kms_datos_arn" { type = string }

data "aws_caller_identity" "actual" {}

locals {
  sufijo = data.aws_caller_identity.actual.account_id
}

resource "aws_s3_bucket" "media" {
  bucket        = "edtech-${var.entorno}-media-${local.sufijo}"
  force_destroy = var.entorno == "dev"
}

resource "aws_s3_bucket" "estaticos" {
  bucket        = "edtech-${var.entorno}-estaticos-${local.sufijo}"
  force_destroy = var.entorno == "dev"
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "estaticos" {
  bucket                  = aws_s3_bucket.estaticos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_datos_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    id     = "abortar-multipart-incompletos"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

output "bucket_media" { value = aws_s3_bucket.media.bucket }
output "bucket_media_arn" { value = aws_s3_bucket.media.arn }
output "bucket_estaticos" { value = aws_s3_bucket.estaticos.bucket }
output "bucket_estaticos_arn" { value = aws_s3_bucket.estaticos.arn }
