# Cluster ECS Fargate + ALB único con listener y regla por path (D10, doc 07 §5).
# A-22: sin dominio propio no hay cert ACM validable → el listener de dev es
# HTTP:80; el HTTPS de cara al público lo pone CloudFront (cert por defecto).
variable "entorno" { type = string }
variable "vpc_id" { type = string }
variable "subredes_publicas" { type = list(string) }
variable "sg_alb_id" { type = string }

resource "aws_ecs_cluster" "principal" {
  name = "edtech-${var.entorno}-cluster"
  setting {
    name  = "containerInsights"
    value = "disabled" # dev: cuesta más de lo que aporta
  }
}

resource "aws_ecs_cluster_capacity_providers" "spot" {
  cluster_name       = aws_ecs_cluster.principal.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
}

resource "aws_lb" "principal" {
  name               = "edtech-${var.entorno}-alb"
  load_balancer_type = "application"
  security_groups    = [var.sg_alb_id]
  subnets            = var.subredes_publicas
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.principal.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "application/json"
      message_body = "{\"error\":{\"code\":\"NO_ENCONTRADO\",\"message\":\"Ruta sin servicio\"}}"
      status_code  = "404"
    }
  }
}

output "cluster_arn" { value = aws_ecs_cluster.principal.arn }
output "cluster_name" { value = aws_ecs_cluster.principal.name }
output "alb_arn" { value = aws_lb.principal.arn }
output "alb_dns" { value = aws_lb.principal.dns_name }
output "listener_arn" { value = aws_lb_listener.http.arn }
