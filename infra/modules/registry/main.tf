# 7 repositorios ECR con scan_on_push y lifecycle de últimas 10 imágenes (doc 07 §4).
locals {
  repos = [
    "identity-access", "catalog", "enrollment-progress",
    "gamification", "flashcards", "payments", "web"
  ]
}

resource "aws_ecr_repository" "repo" {
  for_each = toset(local.repos)
  name     = "edtech/${each.value}"
  image_scanning_configuration {
    scan_on_push = true
  }
  tags = { Service = each.value }
}

resource "aws_ecr_lifecycle_policy" "ultimas_10" {
  for_each   = toset(local.repos)
  repository = aws_ecr_repository.repo[each.value].name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Conservar solo las últimas 10 imágenes"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

output "repos" {
  value = { for r in local.repos : r => aws_ecr_repository.repo[r].repository_url }
}
