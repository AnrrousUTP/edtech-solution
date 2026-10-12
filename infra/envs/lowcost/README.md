# Entorno serverless lowcost

## Estado de implementación

Esta carpeta administra la infraestructura serverless aislada del entorno anterior. La entrega pública usa `catalog`, `payments`, `enrollment-progress`, `affiliates`, `iot-terminals` y `control`; el inicio de sesión permanece en Cognito. El checkout confirma compras directamente en Payments, sin contactar PayPal ni otra pasarela: guarda orden, pago confirmado y eventos outbox en una sola transacción. El evento crea el acceso al curso, registra una comisión única del 5% si la visita llegó por QR y puede notificar al terminal IoT. La compra es de demostración: no mueve dinero real ni procesa tarjetas. Gamificación e IA quedan fuera de esta entrega. La UI está publicada en Amplify y las APIs usan API Gateway/Lambda; IoT se habilita por separado.

La configuración predeterminada conserva el modo pausado. Aplicar la base puede generar cargos por almacenamiento de tablas/bucket y servicios provisionados aunque no tengan tráfico. La validación local de Terraform no consulta la cuenta, no crea un plan remoto y no demuestra que una publicación funcione. `enabled_domains` limita explícitamente los dominios aprovisionados; su valor inicial es el conjunto mínimo para el flujo afiliado.

## Herramienta de respaldo y carga inicial

Para preparar la compra de demostración de USD 40 (comisión esperada USD 2), el seed del flujo escribe el curso publicado y la proyección de precio que consulta Payments. Usa `bun run tools/seed/lowcost-affiliate-demo.ts plan` para revisar valores; tras validar el perfil/cuenta y las tablas, ejecuta `bun run tools/seed/lowcost-affiliate-demo.ts apply`. El seed no crea órdenes ni comisiones.

`bun run db:migrate:aurora-dynamodb export <directorio>` crea una instantánea consistente gzip/JSONL desde los esquemas PostgreSQL y guarda conteos y huellas por tabla. `import <directorio>` escribe registros etiquetados como `LegacySnapshotRecord` en la tabla DynamoDB de cada dominio con escrituras repetibles, reintentos y payloads grandes en S3. `verify <directorio>` compara conteos y huellas usando GSI1. La herramienta no emite eventos, no crea ventas y no borra filas.

Ejemplo desde PowerShell; configura valores en la sesión sin pegarlos en el repositorio ni mostrarlos en pantalla:

```powershell
$env:AURORA_EXPORT_URL = '<URL de solo lectura de Aurora>'
bun run db:migrate:aurora-dynamodb export .local/migration/corte-01

$env:EDTECH_TABLE_IDENTITY_ACCESS = 'edtech-lowcost-identity-access'
$env:EDTECH_TABLE_CATALOG = 'edtech-lowcost-catalog'
$env:EDTECH_TABLE_ENROLLMENT_PROGRESS = 'edtech-lowcost-enrollment-progress'
$env:EDTECH_TABLE_GAMIFICATION = 'edtech-lowcost-gamification'
$env:EDTECH_TABLE_FLASHCARDS = 'edtech-lowcost-flashcards'
$env:EDTECH_TABLE_PAYMENTS = 'edtech-lowcost-payments'
$env:EDTECH_TABLE_AFFILIATES = 'edtech-lowcost-affiliates'
$env:EDTECH_TABLE_IOT_TERMINALS = 'edtech-lowcost-iot-terminals'
$env:EDTECH_MIGRATION_BUCKET = '<bucket privado de contenido>'
bun run db:migrate:aurora-dynamodb import .local/migration/corte-01
bun run db:migrate:aurora-dynamodb verify .local/migration/corte-01
```

Los paquetes se generan en Linux con `bun run lambda:build <dominio>` o, desde Windows, con `bash tools/lambda/build-linux-container.sh <dominio>` en WSL. Los dominios ya preparados y `outbox` producen `.local/lambda/<dominio>/<dominio>.zip` con `handler.mjs`, esquemas y manifiesto hash/revisión. Requieren prueba de integración contra AWS antes de publicarse.

**Límite de esta primera versión:** conserva todas las columnas y relaciones de origen en un sobre de legado, pero aún no transforma registros al modelo PK/SK operativo de cada repositorio ni quita filas obsoletas. Por eso sirve para respaldo, carga controlada y conteo; no habilita por sí sola el corte de tráfico. Los ZIP, handlers de dominio y las proyecciones consultables deben estar listos antes de considerar la migración funcional.

Este estado es independiente de `infra/envs/dev`. No importa el estado anterior ni contiene recursos ECS, ALB, NAT, Aurora o KMS administrados por el cliente. No ejecutar `apply` hasta revisar el plan, haber publicado artefactos Lambda válidos y configurar los valores de `terraform.tfvars` fuera de Git.

La configuración predeterminada deja `pause_public_services=true`, `ready_api_domains=[]`, `enable_workers=false`, `enable_outbox_publisher=false`, `worker_release_ready=false`, `enable_affiliate_events=false`, `enable_iot=false`, `enable_ai=false` y `operation_mode=pausado`. Una API requiere simultáneamente el modo público y su dominio en `ready_api_domains`; no se crean rutas para los demás dominios. Cognito exige issuer y JWKS HTTPS. Los workers genéricos requieren `enable_workers=true` y `worker_release_ready=true`; el publicador de outbox puede habilitarse por separado con `enable_outbox_publisher=true` cuando Payments y Affiliates estén listos. Las reglas de Payments → Affiliates e IoT permanecen apagadas con el entorno pausado. IoT exige un worker validado e IA tiene su interruptor individual. `budget_notification_emails` debe contener de uno a diez correos válidos antes de ejecutar un plan; Budgets exige al menos un suscriptor por alerta.

El backend usa el bucket remoto ya existente, pero requiere una clave nueva. Inicialización sugerida, únicamente cuando el equipo autorice aprovisionar este estado:

```powershell
terraform -chdir=infra/envs/lowcost init -backend-config="bucket=edtech-tfstate-047600599757" -backend-config="key=lowcost/serverless/terraform.tfstate" -backend-config="region=us-east-1" -backend-config="dynamodb_table=edtech-tflock"
terraform -chdir=infra/envs/lowcost validate
terraform -chdir=infra/envs/lowcost plan -var-file="terraform.tfvars"
```

Antes de habilitar un dominio se debe subir su ZIP al bucket privado indicado por `lambda_artifact_bucket`, bajo `<lambda_artifact_prefix>/<dominio>.zip`. Los paquetes deben exponer `handler.handler`. Para habilitar la API de afiliados, provisionar el SecureString de `referral_signing_parameter_name`, rellenar las tres variables de Cognito y añadir `affiliates` a `ready_api_domains`. Su consumidor de eventos se activa por separado con `enable_affiliate_events=true`, una vez que pagos y catálogo publiquen en el bus low-cost. Para Amplify, la propietaria conecta el repositorio `AnrrousUTP/edtech-solution` desde la consola y conserva el plan Free. Luego se cargan `amplify_app_id`, `amplify_default_domain` y `cognito_domain` en `terraform.tfvars`; se importan la app y la rama ya creadas con `terraform -chdir=infra/envs/lowcost import 'aws_amplify_app.production[0]' <app-id>` y `terraform -chdir=infra/envs/lowcost import 'aws_amplify_branch.production[0]' <app-id>/main`. La configuración omite `access_token`: Amplify mantiene su conexión OAuth de consola fuera del estado Terraform. La rama recibe API, Cognito, modo IA/IoT y demás variables de runtime; `amplify.yml` las copia desde el entorno de build a `apps/web/.env.production`, como requiere Next.js SSR en monorepos. Con el modo pausado la compilación automática permanece apagada. El comando `plan` no cambia recursos AWS.

Las tablas usan capacidad bajo demanda, claves compuestas `PK/SK`, índices secundarios dispersos `GSI1/GSI2`, cifrado de AWS y protección contra borrado. Antes de una migración, generar exportación consistente de Aurora, un manifiesto de conteos y una prueba de importación idempotente; mantener las tablas protegidas hasta cerrar la reconciliación.

## Configuración del terminal IoT en Amplify

El navegador no recibe claves AWS permanentes. `/api/iot/session` valida la sesión y la propiedad del afiliado, asume el rol STS acotado al Thing `terminal-demo-01` y entrega una URL WSS SigV4 válida para el handshake. Terraform limita `Connect`, `Publish`, `Subscribe` y `Receive` a ese Thing, su Shadow `promotion` y los topics de `edtech/lowcost`. La regla IoT → SQS solo se crea cuando se habilitan explícitamente el modo público y `enable_iot`.

Después de conectar Amplify y conocer su rol SSR, pasar su nombre a `amplify_execution_role_name` para asignarlo a la app y permitirle asumir únicamente el rol IoT de sesión. Terraform coloca `APP_URL`, `API_BASE`, `EDTECH_IOT_ENABLED`, `EDTECH_IOT_DATA_ENDPOINT`, `EDTECH_IOT_SESSION_ROLE_ARN` y `EDTECH_IOT_THING_NAME` en la rama. El endpoint, el ARN y el nombre del Thing están disponibles como outputs Terraform. No establecer la variable IoT como habilitada hasta completar y probar los handlers y consumidores Lambda.
