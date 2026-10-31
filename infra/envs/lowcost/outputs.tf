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
output "event_alerts_topic_arn" {
  value       = try(aws_sns_topic.event_alerts[0].arn, "")
  description = "Topic SNS de alertas de DLQ; vacío cuando los consumidores están apagados."
}
output "identity_events_queue_url" {
  value       = try(aws_sqs_queue.identity_events[0].url, "")
  description = "URL para conectar Cognito post-confirmation con identity-access al reactivar el corte."
}
output "identity_events_queue_arn" {
  value       = try(aws_sqs_queue.identity_events[0].arn, "")
  description = "ARN de la cola de identidad para conceder SendMessage a Cognito post-confirmation."
}
output "iot_data_endpoint" {
  value       = "https://${data.aws_iot_endpoint.data.endpoint_address}"
  description = "Endpoint ATS para MQTT sobre WebSocket firmado."
}
output "iot_session_role_arn" {
  value       = aws_iam_role.iot_browser_session.arn
  description = "Rol STS temporal con acceso MQTT al Thing de demostración."
}
output "iot_thing_name" { value = var.iot_thing_name }

