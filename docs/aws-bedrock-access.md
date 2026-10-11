# Solicitar revisión de acceso a Bedrock

En la cuenta del proyecto, `amazon.nova-micro-v1:0` aparece en el catálogo y la región está disponible. Sin embargo, `get-foundation-model-availability` responde `NOT_AUTHORIZED` y una solicitud pequeña de Converse responde `ValidationException: Operation not allowed`. El usuario IAM consultado tiene `AdministratorAccess`, así que agregar más permisos IAM no resolvería el bloqueo observado.

## Texto para AWS Support

Abrir un caso en AWS Support, en la categoría de cuenta y servicio Amazon Bedrock, con este texto:

> Solicito revisar la autorización de Amazon Bedrock para esta cuenta en us-east-1. El modelo Amazon Nova Micro `amazon.nova-micro-v1:0` figura en el catálogo y la región está disponible, pero `GetFoundationModelAvailability` devuelve `authorizationStatus=NOT_AUTHORIZED` y `Converse` devuelve `ValidationException: Operation not allowed`. El usuario que hizo la prueba tiene `AdministratorAccess`. ¿Pueden confirmar si existe una restricción de cuenta que impide invocar modelos y qué paso requiere el titular? Queremos conservar el plan AWS FREE y consumir únicamente los créditos existentes; no autorizamos pasar al plan de pago. No incluyan cambios de facturación en la resolución.

Adjuntar el ID de cuenta dentro del caso abierto en la consola y la hora de la prueba. No adjuntar claves de acceso, contraseñas, tokens, archivos Terraform de estado ni el informe completo de CLI.

Después de recibir respuesta, volver a comprobar autorización e invocación con `node tools/aws/revisar-demo.mjs`. Ese script puede registrar el bloqueo, pero no elimina restricciones de AWS.

## Costo que debe resolverse antes de publicar

El NAT Gateway y el ALB ya se retiraron con Terraform. Antes sumaban alrededor de USD 0.0675 por hora (USD 48.60 por 30 días), sin tráfico ni recursos adicionales. La VPC y el clúster ECS siguen creados; la salida de las subredes privadas y el ingreso HTTP público están apagados. Aurora y sus datos se conservaron.

Los servicios ECS tienen `desiredCount=0`; no pueden volver a iniciarse con la configuración actual: las subredes privadas perdieron salida a internet y ya no hay ALB para recibir tráfico. Sus estados Terraform separados aún hacen referencia a las reglas del listener eliminado. Antes de reactivar ECS, hay que planear la actualización de esos siete estados y preparar una arquitectura de demo; aplicar Terraform en un solo servicio con el listener ausente podría fallar. Los estados compartidos de red y cómputo declaran NAT y ALB deshabilitados para que Terraform no los recree automáticamente.
