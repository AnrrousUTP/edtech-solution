output "api_url" {
  value       = aws_apigatewayv2_api.http.api_endpoint
  description = "Endpoint de API Gateway. No tendrá rutas mientras pause_public_services=true."
}

output "dynamodb_tables" {
  value       = { for domain, table in aws_dynamodb_table.domain : domain => table.name }
  description = "Tablas aisladas del nuevo entorno."
}

output "content_bucket" {
  value       = aws_s3_bucket.content.bucket
  description = "Bucket privado para contenido, certificados y audio temporal."
}

output "event_bus_name" { value = aws_cloudwatch_event_bus.main.name }
output "jobs_queue_url" { value = aws_sqs_queue.jobs.url }
output "iot_data_endpoint" {
  value       = "https://${data.aws_iot_endpoint.data.endpoint_address}"
  description = "Endpoint ATS para MQTT sobre WebSocket firmado."
}
output "iot_session_role_arn" {
  value       = aws_iam_role.iot_browser_session.arn
  description = "Rol STS temporal con acceso MQTT al Thing de demostración."
}
output "iot_thing_name" { value = var.iot_thing_name }

