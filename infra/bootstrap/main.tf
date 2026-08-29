# Bootstrap del huevo y la gallina (doc 07 §3): bucket de state + tabla de locks.
# State LOCAL, se corre UNA vez y su terraform.tfstate se versiona en el repo
# (no contiene secretos: solo dos nombres de recurso).
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
  default_tags {
    tags = {
      Project   = "edtech"
      Env       = "dev"
      Service   = "shared"
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "actual" {}

resource "aws_s3_bucket" "tfstate" {
  bucket = "edtech-tfstate-${data.aws_caller_identity.actual.account_id}"
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_dynamodb_table" "tflock" {
  name         = "edtech-tflock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}

output "bucket_state" {
  value = aws_s3_bucket.tfstate.bucket
}

output "tabla_locks" {
  value = aws_dynamodb_table.tflock.name
}
