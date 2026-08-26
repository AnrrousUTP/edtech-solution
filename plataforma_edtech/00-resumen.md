# Plan: EdTech Solution — plataforma de cursos gamificada sobre AWS

> **2026-08-26.** Pedido de Sebastián: convertir el *mega-prompt v2* y la captura
> `Arquitectura.png` en un **plan ejecutable completo** que se le entrega a **Fable 5**
> para que construya la plataforma de punta a punta en una sesión autónoma con terminal,
> AWS CLI configurado y credenciales de PayPal sandbox provistas.
>
> **Los dos insumos se contradicen.** El mega-prompt dice Aurora PostgreSQL, repo por
> servicio, pnpm, auth propia y no menciona Cognito; la captura dice Aurora MySQL,
> Cognito, App Mesh, Flutter y siete servicios con otros nombres. Este plan **resuelve
> cada contradicción** (hallazgos H1-H8, decisiones D1-D20) para que Fable no tenga que
> inventar supuestos.
>
> **Restricción operativa: la planificación es 100 % local y en markdown.** No se crea
> repo Git, no se corre `terraform`, no se toca AWS. Lo que se entrega es esta carpeta +
> el archivo de credenciales. La construcción real la hace Fable después.

## Qué es el producto

**EdTech Solution** es una plataforma de cursos de programación con progresión por
niveles, gamificación y aprendizaje asistido por IA — un híbrido entre **Duolingo**
(rachas, insignias, mapa de niveles, micro-celebraciones) y **Google Skills** (rutas
profesionales, certificados con peso curricular). Catálogo inicial: **HTML, CSS,
Express**.

Modelo de contenido: **Carrera** → **Curso** → **Tomo/Nivel** → **Lección**. Un curso de
un tomo se completa en ~4 semanas y otorga **insignia + certificado menor**; completar la
carrera otorga **certificado mayor**.

## Índice

| Doc | Contenido |
|---|---|
| [01-alcance-y-contradicciones](01-alcance-y-contradicciones.md) | Mega-prompt vs captura punto por punto: qué manda y por qué. Qué queda **fuera** de Fase 1. Tabla de cobertura §1-§13 |
| [02-dominio](02-dominio.md) | Jerarquía de contenido, **escala de niveles A-N ya definida**, flujo del estudiante, los 6 bounded contexts con agregados, invariantes y fronteras |
| [03-modelo-de-datos](03-modelo-de-datos.md) | Un schema Postgres por servicio: DDL, enums, índices, tabla de idempotencia, y la **regla de no-JOIN entre schemas** con su alternativa por proyección |
| [04-arquitectura-hexagonal](04-arquitectura-hexagonal.md) | El estándar obligatorio hecho código: árbol de carpetas, `Result`, CommandBus/QueryBus, VOs, `pullEvents()`, `IEventPublisher`, prohibiciones. **Servicio de ejemplo completo** |
| [05-eventos-y-mensajeria](05-eventos-y-mensajeria.md) | **Catálogo cerrado de 26 eventos** con productor/consumidores/payload, bus EventBridge, reglas, SQS+DLQ, reintentos, idempotencia, y qué llamada síncrona está permitida |
| [06-monorepo-y-aislamiento](06-monorepo-y-aislamiento.md) | Un repo, microservicios de verdad: layout, Bun workspaces, shared-kernel con la regla de los tres usos, las 5 reglas de arch-check, y **cómo despliega independiente en AWS** |
| [07-infraestructura-aws](07-infraestructura-aws.md) | Módulos Terraform con state separado, orden de `apply`, `dev` vs `prod`, **ALB vs API Gateway resuelto**, App Mesh descartado |
| [08-identidad-cognito](08-identidad-cognito.md) | User Pool, grupos, claims, login desde Next.js, validación de JWT por servicio, reparto Cognito ↔ `identity-access-service` |
| [09-pagos-paypal](09-pagos-paypal.md) | `PasarelaPagoPort`, orden → captura → webhook verificado → SQS interna → `PagoConfirmadoEvent`, idempotencia, comisiones Perú, secretos |
| [10-agente-ia-flashcards](10-agente-ia-flashcards.md) | Bedrock Agent nativo, disparo por evento, `GeneradorFlashcardsPort`, flujo HITL, caché por hash, **model ID a verificar, no a inventar** |
| [11-frontend-nextjs](11-frontend-nextjs.md) | Pantallas, lenguaje visual propio, **sin hover con movimiento ni transforms**, consumo de APIs, sesión Cognito, preparación para móvil |
| [12-harness-y-ci](12-harness-y-ci.md) | arch-check, lint de convenciones propias, verificación de estructura, tests (dominio / aplicación / **contrato de eventos**), Husky, GitHub Actions con path filters |
| [13-entorno-local](13-entorno-local.md) | `docker compose` con Postgres + LocalStack + los 6 servicios + web, sobre Bun. **Advertencia 9p: el proyecto vive en `/mnt/d`** |
| [14-fases](14-fases.md) | F0-F12, cada una entregable y verificable, con definición de hecho, comando de verificación y dimensionamiento |
| [15-riesgos-invariantes-y-checklist](15-riesgos-invariantes-y-checklist.md) | R1-R22, invariantes I-1..I-15 verificables, checklist de cierre |
| [16-costos-aws](16-costos-aws.md) | Costo mensual estimado de `dev`, el ítem caro (NAT Gateway), y las medidas de apagado |
| [**17-prompt-para-fable**](17-prompt-para-fable.md) | **El entregable operativo.** Mega-prompt v3 sin contradicciones, listo para copiar y pegar en la sesión de Fable |

> El archivo con los pasos para sacar las claves de PayPal está **fuera de esta carpeta**,
> a propósito: [`../CREDENCIALES-PAYPAL.md`](../CREDENCIALES-PAYPAL.md). Nunca se pegan
> credenciales dentro de estos documentos.

## Los ocho hallazgos que ordenan el plan

**H1 — El motor de base de datos está en disputa.** El mega-prompt §3 dice *Aurora
PostgreSQL Serverless v2*; la captura dice *Amazon Aurora (MySQL Compatible)*. No es
cosmético: el diseño de "un schema aislado por servicio" **existe en Postgres y no existe
en MySQL**, donde `schema` y `database` son sinónimos y el aislamiento se tendría que
hacer con bases separadas y GRANTs. → **D1: manda PostgreSQL.** La captura se corrige.

**H2 — Hay dos sistemas de identidad compitiendo.** La captura pone **Cognito** como
autenticación y autorización; el mega-prompt define un `identity-access-service` propio y
nunca menciona Cognito. Construir auth propia es reinventar rotación de tokens, MFA,
recuperación de contraseña y federación social. → **D2: Cognito es el IdP**
(autenticación, grupos, JWT); `identity-access-service` queda como **perfil de usuario,
roles de dominio y decisiones de autorización de negocio**. No hay servicio duplicado.

**H3 — Los servicios de la captura y los bounded contexts del prompt no son la misma
lista.** Captura: Auth, User, Course, Enrollment, Assessment, Gamification, Notification.
Prompt: catalog, enrollment-progress, gamification, flashcards, payments, identity-access.
La captura descompone por *sustantivo técnico*, el prompt por *contexto de negocio* — que
es lo correcto en DDD. → **D3: mandan los 6 contextos del prompt.** `Auth`+`User` colapsan
en `identity-access-service` (D2); `Course` es `catalog-service`; `Assessment` (tests de
nivelación y evaluaciones) **vive dentro de `enrollment-progress-service`** porque el
resultado de un test y el avance de nivel son la misma transacción de negocio;
`Notification` **no es un servicio**, es una cola SQS interna + SES/SNS consumida por
quien la necesite. `flashcards` y `payments` no aparecían en la captura y sí son
contextos reales.

**H4 — "Microservicios" no obliga a "repo por servicio".** El prompt §3 exige repo por
servicio + shared-kernel publicado en un registry privado. Eso son 7 repos, un registry
que montar, y un bump manual de versión por consumidor cada vez que cambia una interfaz —
para **una sola persona**. → **D4: un repositorio, microservicios de verdad en runtime.**
Lo que hace que algo sea un microservicio es su **frontera de despliegue y de datos**, no
la cantidad de `.git`. Se conservan íntegros: un ECR, un servicio ECS, un schema, un state
de Terraform y un job de CI **por servicio**. El aislamiento de código lo fuerza el
**arch-check del harness** (doc 06 §4), que falla el build ante cualquier import cruzado.

**H5 — El prompt asume pnpm; aquí se usa Bun.** → **D5: Bun en todo** — instalación
(`bun install`), workspaces, scripts, runner de tests (`bun test`) y runtime del
contenedor (imagen `oven/bun`). Consecuencias reales que el plan documenta: Prisma tiene
fricción con Bun, así que **el ORM es Drizzle** (D9); y `dependency-cruiser` corre bajo
Node dentro del mismo contenedor de CI (doc 12 §2).

**H6 — App Mesh está en la captura y no hace falta.** App Mesh (o su sucesor,
**ECS Service Connect**) resuelve el tráfico **servicio→servicio síncrono**. En este
diseño la comunicación por defecto es **asíncrona por eventos**, y la síncrona es la
excepción justificada. Montar una malla para tres o cuatro llamadas es coste operativo sin
retorno. → **D6: fuera de Fase 1.** Se usa **ECS Service Connect** (nativo, sin sidecar de
Envoy que administrar) si aparece necesidad real, y se documenta como mejora futura.

**H7 — Flutter aparece en la captura y no en el prompt.** → **D7: Fase 1 es solo web
(Next.js).** El backend es API-first desde el diseño y Cognito ya soporta clientes
móviles, así que la app no queda bloqueada — solo no se construye ahora. El doc 11 §7
deja escrito qué debe cumplir la API para que Flutter entre después sin refactor.

**H8 — El prompt dice "Claude Sonnet 4.6 en Bedrock" y ese identificador puede no existir
en la región.** Hardcodear un model ID que Bedrock rechaza rompe el servicio de flashcards
en el primer despliegue, y el fallo aparece tarde (en runtime, dentro de una Lambda).
→ **D8: el model ID se resuelve en tiempo de build** con
`aws bedrock list-foundation-models` y se guarda en una variable de Terraform, con
verificación previa de que el modelo esté **habilitado** en la cuenta (los modelos de
Bedrock requieren solicitud de acceso explícita). El doc 10 §2 trae el procedimiento.

## Decisiones

| # | Decisión | Dónde se desarrolla |
|---|---|---|
| **D1** | Aurora **PostgreSQL** Serverless v2; un schema + un rol por servicio | 03, 07 |
| **D2** | **Cognito** es el IdP; `identity-access-service` guarda perfil, roles y autorización de dominio | 08 |
| **D3** | **6 bounded contexts**; Assessment dentro de enrollment; Notification es cola + SES/SNS, no servicio | 02 |
| **D4** | **Un repo, microservicios en runtime**: ECR/ECS/schema/state/CI por servicio; aislamiento por arch-check | 06 |
| **D5** | **Bun** en instalación, workspaces, scripts, tests y runtime del contenedor | 06, 13 |
| **D6** | **App Mesh descartado** en Fase 1; ECS Service Connect si hace falta | 07 |
| **D7** | **Solo web** en Fase 1; API preparada para móvil | 11 |
| **D8** | Model ID de Bedrock **resuelto por CLI en build**, no hardcodeado | 10 |
| **D9** | ORM **Drizzle** (compatible con Bun) en vez de Prisma; migraciones con `drizzle-kit` | 03, 06 |
| **D10** | **ALB único** con listener rules por path (`/api/catalog/*`…), no un API Gateway por servicio | 07 |
| **D11** | Escala de niveles **A-N = 14 niveles agrupados en 4 tramos** (Fundamentos, Intermedio, Avanzado, Profesional) | 02 |
| **D12** | Un **bus EventBridge único** `edtech-domain-events`; una cola + DLQ **por par (servicio, grupo de eventos)** | 05 |
| **D13** | **Idempotencia obligatoria** por `event_id` en tabla `processed_events` de cada schema consumidor | 03, 05 |
| **D14** | Los datos ajenos que un servicio necesita para leer se mantienen como **proyección local alimentada por eventos**, nunca por JOIN ni por llamada síncrona en el camino caliente | 03, 05 |
| **D15** | **Región `us-east-1`** (Bedrock tiene la mayor disponibilidad de modelos ahí) | 07 |
| **D16** | Solo entorno **`dev`**; `prod` queda escrito pero detrás de `apply_prod = false` | 07, 14 |
| **D17** | Secretos **siempre** en Secrets Manager; ningún `.env` con valores reales versionado | 09, 07 |
| **D18** | Paridad local con **LocalStack** (EventBridge, SQS, S3, Secrets) + Postgres en Docker | 13 |
| **D19** | **Sin hover con movimiento ni `transform`/`translate`** en toda la UI | 11 |
| **D20** | El proyecto vive en `/mnt/d` (Windows): **el lado que instala es el lado que ejecuta** — `bun install` y `docker compose` desde Windows | 13 |

## Dimensionamiento

Días de trabajo enfocado equivalente. Fable comprime el calendario, pero el
**tamaño relativo** es lo que importa para decidir qué se puede recortar.

| Bloque | Días | Fases |
|---|---|---|
| Cimientos (shared-kernel, harness, entorno local) | 3 | F0, F1 |
| Infraestructura base AWS (network, db, messaging, secrets, edge) | 4 | F2 |
| Los 6 servicios de dominio | 15,5 | F3-F8 |
| Frontend Next.js | 5 | F9 |
| Despliegue (F4-bis primer deploy + F10 resto) | 3 | F4-bis, F10 |
| Bedrock real + HITL end-to-end | 2 | F11 |
| CI/CD, aceptación y cierre | 3 | F12 |
| **Total** | **~35,5** | |

## Criterios de aceptación (Definition of Done)

- [ ] `docker compose up` levanta Postgres + LocalStack + los 6 servicios + web-app, y el
      flujo completo corre en local sin AWS real.
- [ ] El harness (arch-check + lint de convenciones + estructura + tests + contract tests)
      pasa en CI, y **falla a propósito** cuando se introduce un import cruzado entre
      servicios (test negativo obligatorio, doc 12 §6).
- [ ] En AWS `dev`: 6 servicios ECS Fargate corriendo, Aurora con 6 schemas aislados,
      EventBridge enrutando a colas SQS reales, S3+CloudFront sirviendo estáticos,
      Cognito emitiendo JWT válidos.
- [ ] **Flujo demostrable de punta a punta**: catálogo → registro con Cognito → test de
      nivelación → curso asignado → pago PayPal sandbox → `PagoConfirmadoEvent` propaga →
      matrícula habilitada → lección completada → `NivelCompletadoEvent` → insignia y
      certificado → flashcards generadas por Bedrock, aprobadas por admin, visibles al
      estudiante.
- [ ] `DECISIONS.md` en la raíz del repo generado documenta cada supuesto que Fable haya
      tenido que tomar más allá de D1-D20.
- [ ] Ningún servicio importa código de otro; ningún servicio consulta el schema de otro.
      Verificado por script, no por inspección visual.
- [ ] Costo de `dev` medido y bajo el techo del doc 16, con el procedimiento de apagado
      probado al menos una vez.
