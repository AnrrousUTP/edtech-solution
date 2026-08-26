# 07 — Infraestructura AWS (Terraform)

## 1. Región y cuenta

**`us-east-1`** (D15). El motivo determinante es **Bedrock**: es la región con más modelos
disponibles y la primera en recibirlos. Aunque la latencia desde Perú sería algo mejor en
`sa-east-1`, ahí Bedrock tiene un catálogo recortado, y CloudFront ya resuelve la latencia
del contenido estático desde edge locations locales.

## 2. Convención de nombres

`edtech-<entorno>-<recurso>[-<servicio>]`, todo en minúsculas con guiones.

| Recurso | Ejemplo |
|---|---|
| VPC | `edtech-dev-vpc` |
| Cluster ECS | `edtech-dev-cluster` |
| Servicio ECS | `edtech-dev-svc-payments` |
| Repositorio ECR | `edtech/payments` |
| Cola SQS | `edtech-dev-payments` / `edtech-dev-payments-dlq` |
| Bus EventBridge | `edtech-domain-events` (sin entorno: hay uno por cuenta/región y `dev` y `prod` van en cuentas o regiones distintas si algún día conviven) |
| Secreto | `edtech/dev/db/payments`, `edtech/dev/paypal` |
| Bucket S3 | `edtech-dev-media-<account_id>` (los nombres son globales) |
| Rol IAM de tarea | `edtech-dev-task-payments` |

Etiquetas obligatorias en **todo** recurso, vía `default_tags` del provider:
`Project=edtech`, `Env=dev`, `Service=<servicio|shared>`, `ManagedBy=terraform`.
`Service` es lo que hace legible la factura por servicio (doc 16).

## 3. Estados de Terraform

Backend S3 + DynamoDB para locks. **Un state por módulo compartido y uno por servicio**
(mega-prompt §6), para que aplicar un servicio no pueda romper otro.

```
s3://edtech-tfstate-<account_id>/
  dev/network/terraform.tfstate
  dev/security/terraform.tfstate
  dev/database/terraform.tfstate
  dev/messaging/terraform.tfstate
  dev/storage/terraform.tfstate
  dev/edge/terraform.tfstate
  dev/registry/terraform.tfstate
  dev/compute-base/terraform.tfstate        # cluster ECS + ALB
  dev/observability/terraform.tfstate
  dev/ai/terraform.tfstate
  dev/services/catalog/terraform.tfstate
  dev/services/identity-access/terraform.tfstate
  ... (uno por servicio)
```

El bucket de state tiene **versionado activado** y bloqueo de acceso público. La tabla
DynamoDB `edtech-tflock` es PAY_PER_REQUEST (cuesta centavos).

> **Bootstrap del huevo y la gallina.** El bucket de state y la tabla de locks no pueden
> vivir en un state remoto que todavía no existe. Se crean con un `infra/bootstrap/` de
> state local, que se corre **una sola vez** y cuyo `terraform.tfstate` se guarda en el
> repo (no contiene secretos: solo dos nombres de recurso).

## 4. Módulos y orden de aplicación

```
bootstrap → network → security → database ─┬→ messaging ─┬→ compute-base → services/*
                                    │      │             │
                          storage ──┴→ edge┘   observability      ai (necesita messaging)
```

| Módulo | Contiene | Depende de |
|---|---|---|
| `network` | VPC `10.20.0.0/16`, 2 AZ, subredes públicas/privadas, IGW, **1 NAT Gateway** (§9), route tables, VPC endpoints de S3 y ECR | — |
| `security` | KMS (`edtech-dev-datos`, `edtech-dev-mensajeria`), security groups (`alb`, `ecs-tasks`, `aurora`), rol de ejecución de tareas ECS | network |
| `database` | Aurora PostgreSQL Serverless v2 (`0.5–2 ACU` en dev), subnet group privado, parameter group, los 6 schemas + roles (doc 03 §1), secretos de conexión | network, security |
| `messaging` | Bus `edtech-domain-events`, 8 reglas, 6 colas + 6 DLQ + 3 colas internas + sus DLQ, políticas de cola (doc 05) | security |
| `storage` | Buckets `media` (privado, OAC) y `estaticos`, políticas, lifecycle | security |
| `edge` | CloudFront (origen S3 con OAC + origen ALB para `/api/*`), Route53, certificado ACM, **WAF** con managed rules + rate limit | storage, compute-base |
| `registry` | 7 repositorios ECR con `scan_on_push` y lifecycle policy (últimas 10 imágenes) | — |
| `compute-base` | Cluster ECS Fargate, ALB interno-público, listener 443, target groups vacíos, Cloud Map namespace, log groups | network, security |
| `observability` | Dashboard de CloudWatch, alarmas (§8), X-Ray sampling rule, budget de costos | compute-base, messaging |
| `ai` | Bedrock Agent, action group, Lambda del action group, rol IAM (doc 10) | messaging, storage |
| `services/<x>` | Task definition, servicio ECS, auto scaling, listener rule, rol IAM de tarea de mínimo privilegio | todos los anteriores |
| `secrets` | *(no es módulo propio)*: cada módulo crea sus secretos. PayPal se crea en `services/payments` | — |

## 5. Entrada HTTP: ALB único (D10)

**Un ALB** con listener HTTPS 443 y reglas por path. No hay API Gateway.

| Path | Target group |
|---|---|
| `/api/identity/*` | `edtech-dev-tg-identity-access` |
| `/api/catalog/*` | `edtech-dev-tg-catalog` |
| `/api/enrollment/*` | `edtech-dev-tg-enrollment-progress` |
| `/api/gamification/*` | `edtech-dev-tg-gamification` |
| `/api/flashcards/*` | `edtech-dev-tg-flashcards` |
| `/api/payments/*` | `edtech-dev-tg-payments` |
| `/*` | CloudFront → S3 (el frontend) |

**Por qué ALB y no API Gateway.** API Gateway aporta throttling por API key, planes de uso,
transformación de requests y facturación por millón de llamadas. Nada de eso hace falta
acá: los consumidores son el propio frontend y (mañana) la app móvil, la autorización la da
un JWT de Cognito que cada servicio valida, y el rate limit lo pone WAF. Con ALB, además,
el costo es fijo y no por request, y las conexiones largas (SSE del progreso, uploads) no
chocan con el límite de 29 s de API Gateway.

**Por qué no App Mesh** (D6/H6): la comunicación entre servicios es asíncrona por diseño;
la única llamada síncrona de Fase 1 es una lectura de admin con timeout y fallback. Una
malla con sidecars de Envoy para eso son seis contenedores extra que pagar y administrar.
Si en el futuro aparecen llamadas síncronas de verdad, la respuesta es **ECS Service
Connect**, no App Mesh: es nativo, sin sidecar que gestionar, y AWS ya empujó App Mesh
hacia el retiro.

**Autorización en el borde.** El ALB no valida JWT (su autenticación integrada asume OIDC
con cookies de navegador, no un token de API). Cada servicio valida el JWT de Cognito con
el middleware compartido (doc 08 §5). Es una línea de código compartida, y evita depender
de una función del ALB que no encaja con clientes móviles.

## 6. Cómputo

Cada servicio: **1 tarea Fargate, 0.5 vCPU / 1 GB** en `dev`. Auto scaling por CPU al 70 %,
mínimo 1, máximo 3.

- **Fargate Spot** en `dev` para los servicios sin webhook expuesto (todos menos
  `payments`): ~70 % más barato y una interrupción solo significa un reinicio. `payments`
  va en Fargate normal porque perder un webhook de PayPal por una interrupción sí duele.
- Health check: `GET /health` (proceso vivo) y `GET /ready` (BD alcanzable + secreto
  leído). El target group usa `/ready`.
- `stopTimeout = 30s` y apagado ordenado: dejar de aceptar HTTP nuevo, terminar los
  mensajes SQS en vuelo, cerrar la conexión.
- Logs a CloudWatch con `awslogs`, formato **JSON estructurado** con `correlationId`
  (doc 05 §3) — sin eso, seguir un flujo a través de tres servicios es imposible.
- Retención de logs: **7 días en dev** (30 en prod). El default es "para siempre" y es una
  de las formas más tontas de gastar dinero.

## 7. Entornos

`dev` y `prod` como directorios distintos en `infra/envs/`, con sus `tfvars`.

**Solo se aplica `dev`** (D16). `prod` queda escrito, con `apply_prod = false` como
variable de guarda y sin credenciales de CI que le permitan aplicar. Lo que `prod` necesita
antes de existir, y que hoy no está resuelto: un dominio real, un certificado ACM validado,
credenciales de PayPal **live** (no sandbox), una decisión de presupuesto (doc 16) y una
política de backup y retención.

Diferencias planeadas `dev` → `prod`:

| | dev | prod |
|---|---|---|
| Aurora | 0.5–2 ACU, sin réplica, backup 1 día | 1–8 ACU, réplica en otra AZ, backup 7 días + PITR |
| Fargate | 1 tarea, Spot | 2 tareas mínimo, Multi-AZ, sin Spot |
| NAT | 1 | 2 (uno por AZ) |
| WAF | managed rules + rate limit | + reglas geográficas y bot control |
| Logs | 7 días | 30 días |
| Borrado | `force_destroy = true` en buckets | `false` + `prevent_destroy` en Aurora |

## 8. Observabilidad

Adoptada de la captura (doc 01 §1), que llenaba un hueco del mega-prompt.

- **CloudWatch Logs**: un log group por servicio, JSON estructurado, `correlationId` en
  cada línea.
- **X-Ray**: traza distribuida. Importa especialmente porque el flujo cruza EventBridge y
  SQS, donde sin traza un evento perdido es invisible. El `correlationId` se propaga como
  anotación de X-Ray.
- **Alarmas** (las que realmente avisan de algo):

| Alarma | Umbral | Por qué |
|---|---|---|
| DLQ con mensajes | `ApproximateNumberOfMessagesVisible > 0` por 5 min, **cada DLQ** | La más importante de todas: eventos perdiéndose en silencio |
| ALB 5xx | `HTTPCode_Target_5XX_Count > 10` en 5 min | Servicio roto |
| Servicio ECS sin tareas sanas | `RunningTaskCount < 1` por 2 min | Crash loop, típicamente por migración fallida (R2) |
| Aurora CPU | `> 80 %` por 10 min | Query sin índice |
| Aurora conexiones | `> 80 %` del máximo | Fuga de conexiones (R9) |
| Edad del mensaje más viejo | `ApproximateAgeOfOldestMessage > 900 s` | El consumidor no da abasto o está caído |
| Presupuesto | 80 % del techo mensual del doc 16 | Antes de que llegue la factura |

Todas notifican a un topic SNS `edtech-dev-alertas` con el email del operador suscrito.

- **Dashboard** único con: RPS y latencia p99 por servicio, profundidad de cada cola,
  ACU de Aurora, tareas ECS por servicio, y errores 5xx.

## 9. El NAT Gateway y cómo no pagarlo dos veces

Las tareas Fargate viven en subredes privadas y necesitan salida a internet para llamar a
la API de PayPal y para bajar imágenes de ECR. Un NAT Gateway cuesta ~$32/mes de base más
el tráfico — **es el ítem más caro de `dev`** (doc 16).

Mitigaciones que el módulo `network` implementa:

1. **Un solo NAT** en `dev` (en `prod` van dos, uno por AZ, por disponibilidad).
2. **VPC endpoints** de tipo Gateway para **S3** (gratis) y de tipo Interface para
   **ECR api/dkr**, **Secrets Manager**, **CloudWatch Logs**, **SQS** y **EventBridge**.
   Con esos endpoints, casi todo el tráfico deja de pasar por el NAT. Lo único que
   realmente lo cruza es la llamada saliente a PayPal.
3. Está evaluado y **descartado** quitar el NAT por completo poniendo las tareas en subred
   pública con IP: ahorra el NAT pero expone las tareas, y la ganancia no compensa.

## 10. Seguridad

- **IAM de mínimo privilegio por servicio.** El rol de tarea de `payments` puede:
  `sqs:ReceiveMessage/DeleteMessage` **solo** sobre sus dos colas, `events:PutEvents`
  **solo** sobre el bus, `secretsmanager:GetSecretValue` **solo** sobre
  `edtech/dev/db/payments` y `edtech/dev/paypal`, `kms:Decrypt` sobre las dos claves. Nada
  con `Resource: "*"` salvo `logs:PutLogEvents` sobre su propio log group.
- **Security groups encadenados**, no por CIDR: `aurora` solo acepta 5432 desde el SG
  `ecs-tasks`; `ecs-tasks` solo acepta 3000 desde el SG `alb`; `alb` acepta 443 del mundo.
- **KMS**: dos claves con rotación anual. `edtech-dev-datos` cifra Aurora y S3;
  `edtech-dev-mensajeria` cifra SQS y los payloads de EventBridge.
- **Secrets Manager** para todo secreto (D17). Ningún valor real en `.env` versionado, en
  variables de entorno de la task definition, ni en ningún `.md` de este plan.
  Las task definitions referencian secretos con `valueFrom`, que ECS resuelve al arrancar.
- **WAF** delante de CloudFront: `AWSManagedRulesCommonRuleSet`,
  `AWSManagedRulesKnownBadInputsRuleSet` y una regla de rate limit de 2000 req/5min por IP.
- **S3 privado con OAC**: los buckets no tienen acceso público; CloudFront accede con
  Origin Access Control. Los videos y PDFs de certificado se sirven con **URL firmadas**
  de duración corta.
- El endpoint de webhook de PayPal (`/api/payments/webhook`) queda **excluido de la regla
  de rate limit** de WAF por IP: PayPal reintenta desde un rango acotado y limitarlo
  provocaría perder confirmaciones de pago. Su protección es la **verificación de firma**
  (doc 09 §3), que es la correcta para ese caso.
