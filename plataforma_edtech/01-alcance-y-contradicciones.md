# 01 — Alcance, contradicciones y cobertura

> Este documento existe por una razón concreta: si a Fable se le entrega el mega-prompt v2
> **y** la captura de arquitectura sin resolver sus choques, va a elegir por su cuenta y va
> a elegir distinto de lo que se quiere. Acá cada choque queda cerrado, con el motivo, y
> con el número de decisión que lo respalda.

## 1. Los dos insumos, enfrentados

| Punto | Mega-prompt v2 | Captura `Arquitectura.png` | Resuelto | Motivo |
|---|---|---|---|---|
| Motor de BD | Aurora **PostgreSQL** Serverless v2 | Aurora **MySQL** compatible | **PostgreSQL** (D1) | El aislamiento "un schema por servicio" es nativo en Postgres. En MySQL, schema = database: haría falta una base por servicio y el aislamiento pasa a depender solo de GRANTs. Además JSONB, tipos enum reales y `gen_random_uuid()` |
| Identidad | `identity-access-service` propio, sin Cognito | **Amazon Cognito** (usuarios, roles, grupos) | **Cognito + servicio de perfil** (D2) | Auth propia es superficie de seguridad gratuita que nadie pidió. Cognito da MFA, recuperación, federación y rotación sin código |
| Lista de servicios | catalog · enrollment-progress · gamification · flashcards · payments · identity-access | Auth · User · Course · Enrollment · Assessment · Gamification · Notification | **Los 6 del prompt** (D3) | La captura descompone por sustantivo técnico; el prompt por contexto de negocio, que es el criterio correcto. Ver §2 para el mapeo exacto |
| Repos | Repo **por servicio** + shared-kernel en registry privado | (no opina) | **Un repo** (D4) | 7 repos + registry + bumps manuales para una persona. La frontera de microservicio se mantiene donde importa: despliegue y datos |
| Gestor de paquetes | pnpm | (no opina) | **Bun** (D5) | Pedido explícito. Arrastra: ORM Drizzle en vez de Prisma (D9), imagen base `oven/bun` |
| Malla de servicios | Cloud Map **o** ALB con listener rules | **AWS App Mesh** | **ALB con listener rules** (D10), App Mesh fuera (D6) | La comunicación por defecto es asíncrona. Una malla para 3-4 llamadas síncronas es coste operativo puro. Si aparece la necesidad: ECS Service Connect, no App Mesh (que Amazon ya empujó a retiro) |
| Entrada HTTP | API Gateway **o** ALB | **API Gateway** | **ALB único** (D10) | Los servicios corren en Fargate dentro de VPC, con conexiones largas y sin necesidad de throttling por API key. ALB + WAF cubre lo mismo más barato y con menos piezas. El API Gateway se justificaría si hubiera Lambdas expuestas o planes de uso por cliente |
| Clientes | Solo web (Next.js) | Web **+ Flutter** | **Solo web** (D7) | Fase 1. La API queda API-first y Cognito ya sirve clientes móviles; el doc 11 §7 fija el contrato para que Flutter entre después sin refactor |
| Pasarela de pago | **Solo PayPal** | "Stripe / PayPal" | **Solo PayPal** | Stripe no opera con cuentas peruanas sin LLC extranjera. La captura es genérica; el prompt tiene la decisión de negocio real. `PasarelaPagoPort` deja la puerta abierta a Culqi/Mercado Pago |
| IA | Bedrock (agente nativo) | "OpenAI / Bedrock" | **Bedrock** | Todo el stack ya es AWS; agregar OpenAI mete otra credencial, otra factura y otro punto de fallo fuera de la VPC |
| Notificaciones | No se menciona | SES (email) + SNS/Pinpoint (push) | **SES en Fase 1**, SNS diferido | Email transaccional (certificado emitido, pago confirmado) sí hace falta. Push sin app móvil no tiene destinatario (D7) |
| Observabilidad | No se menciona | CloudWatch Logs/Metrics + X-Ray + Alarms | **Se adopta de la captura** | El prompt tiene un hueco acá y la captura lo llena bien. X-Ray importa especialmente porque el flujo cruza EventBridge y SQS, donde un fallo es invisible sin traza |
| Borde | S3 + CloudFront | + Route53, WAF, ACM, OAC/Signed URL | **Se adopta de la captura** | Otro hueco del prompt bien cubierto. OAC es además la forma correcta de servir S3 privado |

## 2. Mapeo de los servicios de la captura a los contextos

| Servicio en la captura | A dónde va | Por qué |
|---|---|---|
| **Auth Service** | Cognito (gestionado) | No se escribe código de autenticación |
| **User Service** | `identity-access-service` | Perfil, roles de dominio, preferencias. Se alimenta del `post-confirmation` de Cognito |
| **Course Service** | `catalog-service` | Carreras, cursos, tomos, lecciones, precios, publicación |
| **Enrollment Service** | `enrollment-progress-service` | Matrícula, avance, lección completada |
| **Assessment Service** | **dentro de** `enrollment-progress-service` | Un intento de test y el avance de nivel que provoca son **una sola transacción de negocio**. Separarlos obliga a una saga distribuida para algo que no la necesita. El banco de preguntas, en cambio, es contenido: vive en `catalog-service` |
| **Gamification Service** | `gamification-service` | Insignias, certificados, rachas, puntos |
| **Notification Service** | **cola SQS `notifications` + SES** | No hay estado de negocio propio, no hay reglas de dominio: es un consumidor de eventos que formatea y envía. Un servicio ECS entero para eso es un contenedor que pagar sin razón |
| *(no aparecía)* | `flashcards-service` | Contexto real con HITL y estado propio |
| *(no aparecía)* | `payments-service` | Contexto real con dinero, webhooks e idempotencia |

## 3. Alcance de Fase 1

**Entra:**

- Los 6 servicios de dominio, hexagonales, con su schema y su despliegue independiente.
- Cognito + registro/login/roles.
- Catálogo, test de nivelación, consumo de curso, evaluaciones, progreso.
- Gamificación: insignias, certificados (PDF), racha.
- Pago PayPal sandbox de punta a punta, con webhook verificado.
- Flashcards generadas por Bedrock con aprobación humana.
- Frontend Next.js con las 8 pantallas del doc 11.
- Infra Terraform completa aplicada en `dev`.
- Harness + CI por servicio.
- Paridad local con Docker Compose + LocalStack.

**No entra (y queda escrito por qué):**

| Fuera de alcance | Motivo | Dónde queda anotado |
|---|---|---|
| App Flutter | D7 | 11 §7 |
| Entorno `prod` aplicado | D16 — se escribe el `tfvars` pero no se aplica; `prod` exige dominio real, certificado ACM validado y decisión de costo | 07 §7 |
| App Mesh / service mesh | D6 | 07 §5 |
| Push notifications (SNS/Pinpoint) | Sin app móvil no hay a quién notificar | 01 §1 |
| Multi-tenant real (aislamiento por organización) | La captura lo lista como beneficio pero el dominio de Fase 1 es B2C de un solo tenant. Meterlo ahora contamina cada agregado con un `tenant_id` que nadie usa | 15 §deuda |
| Video bajo demanda con transcodificación (MediaConvert) | El contenido de Fase 1 es texto, código y ejercicios. El player del doc 11 reproduce video subido tal cual desde S3/CloudFront | 15 §deuda |
| Búsqueda full-text del catálogo (OpenSearch) | El catálogo inicial son 3 cursos. `ILIKE` sobre Postgres alcanza | 15 §deuda |

## 4. Lo que Fable NO debe decidir por su cuenta

El mega-prompt v2 delegaba varias decisiones a Fable ("a definir por Fable", "según lo que
decidas al planificar"). Todas quedan cerradas acá:

| Lo que el prompt delegaba | Ahora está cerrado en |
|---|---|
| Escala de niveles A-N | 02 §2 (D11) |
| Cloud Map vs ALB | 07 §5 (D10) |
| Región AWS | 07 §1 (D15) |
| Registry privado del shared-kernel | No hay registry: workspace local (D4), doc 06 §3 |
| Qué eventos existen y quién los consume | 05 §2 — catálogo cerrado |
| Nombres de recursos AWS | 07 §2 — convención de nombres fija |

Lo único que Fable resuelve en ejecución es el **model ID de Bedrock** (D8), y no lo
inventa: lo consulta con la CLI (doc 10 §2).

## 5. Cobertura del mega-prompt v2

Verificación de que ninguna sección del prompt original se perdió en la traducción.

| § del prompt | Tema | Cubierto en |
|---|---|---|
| §0 | Rol y modo de operación | 17 §0 |
| §1 | Visión del producto | 00, 02 §1 |
| §2.1-2.3 | Jerarquía, flujo del estudiante, vistas | 02 §1-§4 |
| §2.4 | Bounded contexts como servicios | 02 §5, 06 |
| §3 | Stack técnico | 00 (D1-D20), 06, 07 |
| §4.1 | Principios de arquitectura hexagonal | 04 §1-§5 |
| §4.2 | Mensajería EventBridge + SQS | 05 |
| §4.3 | Gobierno del shared kernel | 06 §3 |
| §4.4 | Estructura de directorios | 04 §6, 06 §2 |
| §4.5 | Flujo de control | 04 §7 |
| §5 | Frontend | 11 |
| §6 | Infraestructura Terraform | 07 |
| §7 | Agente de IA / flashcards | 10 |
| §8 | Fronteras entre servicios | 06 §4 |
| §9 | PayPal | 09 + `../CREDENCIALES-PAYPAL.md` |
| §10 | Harness | 12 |
| §11 | Plan de ejecución | 14 |
| §12 | Criterios de aceptación | 00 §DoD, 15 §checklist |
| §13 | Supuestos por defecto | 00 §Decisiones (D1-D20) |
