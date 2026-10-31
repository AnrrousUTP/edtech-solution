variable "aws_region" {
  description = "Región del nuevo entorno aislado."
  type        = string
  default     = "us-east-1"
}

variable "content_bucket_name" {
  description = "Nombre globalmente único para el bucket privado del entorno lowcost."
  type        = string
}

variable "enabled_domains" {
  description = "Dominios incluidos en la arquitectura de destino; no se aprovisionan mientras el entorno esté pausado."
  type        = set(string)
  default = [
    "identity-access",
    "catalog",
    "enrollment-progress",
    "gamification",
    "flashcards",
    "payments",
    "affiliates",
    "iot-terminals",
  ]
  validation {
    condition = length(var.enabled_domains) > 0 && alltrue([for domain in var.enabled_domains : contains([
      "identity-access", "catalog", "enrollment-progress", "gamification", "flashcards",
      "payments", "affiliates", "iot-terminals",
    ], domain)])
    error_message = "enabled_domains contiene un dominio desconocido."
  }
}

variable "lambda_artifact_bucket" {
  description = "Bucket existente de artefactos; vacío usa el bucket privado de contenido."
  type        = string
  default     = ""
}

variable "lambda_artifact_prefix" {
  description = "Prefijo inmutable para los ZIP de una versión probada."
  type        = string
  default     = "lowcost/releases/bootstrap"
}

variable "ready_api_domains" {
  description = "Dominios cuyos handlers DynamoDB/Lambda ya pasaron pruebas y tienen ZIP cargado. Vacío conserva API sin rutas."
  type        = set(string)
  default     = []
  validation {
    condition = alltrue([for domain in var.ready_api_domains : contains([
      "identity-access", "catalog", "enrollment-progress", "gamification", "flashcards",
      "payments", "affiliates", "iot-terminals",
    ], domain)]) && (!contains(var.ready_api_domains, "enrollment-progress") || (contains(var.ready_api_domains, "catalog") && contains(var.ready_api_domains, "payments")))
    error_message = "ready_api_domains contiene un dominio desconocido o enrollment-progress sin catalog y payments."
  }
}

variable "cognito_issuer" {
  description = "Issuer HTTPS del User Pool Cognito usado para validar JWT de las APIs."
  type        = string
  default     = ""
}

variable "cognito_client_id" {
  description = "App client de Cognito autorizado para las APIs."
  type        = string
  default     = ""
}

variable "cognito_jwks_uri" {
  description = "URL HTTPS del JWKS del User Pool Cognito."
  type        = string
  default     = ""
}

variable "referral_signing_parameter_name" {
  description = "Nombre SecureString de Parameter Store con la llave Ed25519 privada de atribución."
  type        = string
  default     = "/edtech/lowcost/affiliate-signing-key"
}

variable "referral_verification_parameter_name" {
  description = "Nombre del parámetro estándar con la clave pública Ed25519 para atribución en pagos."
  type        = string
  default     = "/edtech/lowcost/referral-verification-public-key"
}

variable "paypal_secret_name" {
  description = "Nombre de Secrets Manager con las credenciales PayPal y el ID del webhook de lowcost."
  type        = string
  default     = "edtech/lowcost/paypal"
  validation {
    condition     = trimspace(var.paypal_secret_name) != "" && !strcontains(var.paypal_secret_name, "*")
    error_message = "paypal_secret_name debe ser un nombre concreto de Secrets Manager."
  }
}

variable "allowed_origins" {
  description = "Orígenes web HTTPS permitidos por API Gateway."
  type        = list(string)
  default     = []
}

variable "budget_notification_emails" {
  description = "Correos autorizados para recibir avisos del presupuesto de AWS."
  type        = list(string)
  nullable    = false
  validation {
    condition = length(var.budget_notification_emails) >= 1 && length(var.budget_notification_emails) <= 10 && alltrue([
      for email in var.budget_notification_emails : can(regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", email))
    ])
    error_message = "Configura entre uno y diez correos válidos para que AWS Budgets pueda enviar las alertas de costo."
  }
}

variable "pause_public_services" {
  description = "Cuando es true, las funciones no ejecutan y API Gateway no tiene rutas públicas."
  type        = bool
  default     = true
}

variable "enable_event_consumers" {
  description = "Activa los consumidores SQS por dominio después de validar sus flujos."
  type        = bool
  default     = false
}

variable "enable_outbox_publisher" {
  description = "Activa el publicador DynamoDB Streams → EventBridge, sin activar consumidores SQS."
  type        = bool
  default     = false
}

variable "event_consumers_release_ready" {
  description = "Confirma que los handlers Lambda y sus consumidores SQS pasaron validación local."
  type        = bool
  default     = false
}

variable "enable_affiliate_events" {
  description = "Activa la cola dedicada de conversiones y reembolsos cuando la API de afiliados ya está lista."
  type        = bool
  default     = false
}

variable "enable_iot" {
  description = "Activa integraciones y permisos de datos IoT después de la validación."
  type        = bool
  default     = false
}

variable "iot_thing_name" {
  description = "Thing IoT existente que representa el terminal virtual de demostración."
  type        = string
  default     = "terminal-demo-01"
}

variable "enable_ai" {
  description = "Activa Bedrock y Transcribe únicamente cuando la cuenta autorice los modelos."
  type        = bool
  default     = true
}

variable "assistant_bedrock_model_id" {
  description = "Inference profile de Bedrock para el asistente académico."
  type        = string
  default     = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
}

variable "enable_point_in_time_recovery" {
  description = "Activa recuperación continua de DynamoDB, que añade costo."
  type        = bool
  default     = false
}

variable "operation_mode" {
  description = "Modo global de operación de la aplicación."
  type        = string
  default     = "pausado"
  validation {
    condition     = contains(["pausado", "publico", "mantenimiento"], var.operation_mode)
    error_message = "operation_mode debe ser pausado, publico o mantenimiento."
  }
}

variable "amplify_app_id" {
  description = "ID de la app Amplify preexistente si se importa al nuevo estado."
  type        = string
  default     = ""
}

variable "amplify_branch_name" {
  description = "Única rama de producción publicada en Amplify."
  type        = string
  default     = "main"
}

variable "enable_amplify_branch" {
  description = "Permite crear la rama de producción cuando el commit ya está publicado en el repositorio conectado."
  type        = bool
  default     = true
}

variable "amplify_default_domain" {
  description = "Dominio predeterminado de Amplify de la app importada, sin protocolo."
  type        = string
  default     = ""
}

variable "cognito_domain" {
  description = "Dominio HTTPS del Hosted UI de Cognito."
  type        = string
  default     = ""
}

variable "amplify_execution_role_name" {
  description = "Rol de servicio de Amplify para registros de SSR."
  type        = string
  default     = "AmplifySSRLoggingRole-f6a10ac4-3aa3-4664-880b-a59b4f95b78e"
}

variable "amplify_compute_role_name" {
  description = "Rol de cómputo SSR de Amplify con permisos limitados de la aplicación."
  type        = string
  default     = "edtech-lowcost-amplify-compute"
}

