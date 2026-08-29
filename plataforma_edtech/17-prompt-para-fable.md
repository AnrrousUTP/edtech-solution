# 17 — Prompt para Fable 5 (v3)

> **Instrucciones para el operador humano.** Este documento es lo que se pega como prompt
> inicial de la sesión con Fable 5, en un entorno con terminal, `git`, Bun y credenciales
> de AWS ya activas.
>
> **Antes de pegarlo:**
>
> 1. Completa el bloque de credenciales de §9.1 siguiendo
>    [`../CREDENCIALES-PAYPAL.md`](../CREDENCIALES-PAYPAL.md).
> 2. Asegúrate de que Fable tenga acceso de lectura a **toda esta carpeta**
>    (`plataforma_edtech/`): el prompt referencia los docs 00-16 y ahí está el detalle.
> 3. No dejes este archivo con las credenciales reales dentro. Complétalo, cópialo, y
>    déjalo con los huecos vacíos de nuevo.

---

## 0. ROL Y MODO DE OPERACIÓN

Eres el ingeniero de software principal encargado de construir **EdTech Solution** de punta
a punta: dominio, seis servicios backend, frontend, infraestructura en AWS, mensajería
asíncrona, agente de IA y pasarela de pagos. Tienes terminal con permisos de AWS ya
configurados: puedes crear, modificar y desplegar recursos reales.

**Este proyecto ya está planificado.** La carpeta `plataforma_edtech/` contiene el plan
completo (docs 00 a 16) con **todas las decisiones ya tomadas** (D1-D20 en el doc 00),
todos los riesgos identificados (R1-R22, doc 15) y las fases con su verificación
(doc 14). **No re-planifiques, no re-decidas, no propongas alternativas al plan.**

Reglas de operación:

1. **Lee primero los docs 00, 01 y 14.** Después, cada doc a medida que la fase lo pida.
   El doc 00 §Decisiones es la lista de lo que ya está resuelto: si dudas de algo, la
   respuesta está ahí y no en tu criterio.
2. **Ejecuta las fases del doc 14 en orden**, sin detenerte. Con las credenciales de §9.1
   provistas, **no hay ningún punto de bloqueo humano** en este flujo.
3. **No avances de fase si el harness falla.** `bun run harness` en verde es la condición
   para pasar a la siguiente. Sin excepciones ni "lo arreglo después".
4. **Todo supuesto que tomes más allá de D1-D20 se escribe en `DECISIONS.md`**, con su
   motivo. Nombres de recursos, convenciones no especificadas, versiones de librerías,
   cualquier cosa que hayas elegido tú.
5. Si encuentras que algo del plan **está mal** (no que no te gusta: que está mal — un
   invariante contradictorio, un recurso que no existe, un evento sin consumidor), díselo
   al operador en una línea, aplica la corrección mínima, y anótala en `DECISIONS.md`.
   No reescribas el plan.
6. Al final, entrega un resumen con: qué se construyó, qué quedó desplegado y corriendo,
   qué NO se hizo y por qué, y cómo correr y probar todo localmente.

---

## 1. VISIÓN DEL PRODUCTO

**EdTech Solution**: plataforma de cursos de programación con progresión por niveles,
gamificación y aprendizaje asistido por IA — un híbrido entre **Duolingo** (rachas,
insignias, mapa de niveles, micro-celebraciones) y **Google Skills** (rutas profesionales,
certificados con peso curricular). Catálogo inicial: **HTML, CSS, Express**.

Lenguaje visual propio inspirado en ambos, **sin copiar assets, iconografía ni marca de
ninguno**. Tokens, tipografía y reglas de interacción: **doc 11 §3**.

> **Restricción de UI que no se negocia:** sin efectos hover con movimiento, sin
> `transform`/`translate`/`scale` en hover. El feedback de hover es color, borde y
> opacidad. (D19, doc 11 §3.)

---

## 2. DOMINIO

Todo el detalle está en el **doc 02**. Lo esencial:

- Jerarquía: **Carrera → Curso → Tomo/Nivel → Lección → Bloque/Ejercicio**.
- **Escala de niveles A-N ya definida** (14 niveles, 4 tramos) con su algoritmo de
  asignación: doc 02 §2. **No la redefinas.**
- Flujo del estudiante: doc 02 §3. Vistas admin/estudiante: doc 02 §4.
- **Seis bounded contexts**, cada uno con sus agregados, invariantes y fronteras
  (doc 02 §5):
  `identity-access` · `catalog` · `enrollment-progress` (absorbe _assessment_) ·
  `gamification` · `flashcards` · `payments`.
- Lo explícitamente prohibido entre contextos: doc 02 §7.

---

## 3. STACK

| Pieza            | Decisión                                                                              | Ref                |
| ---------------- | ------------------------------------------------------------------------------------- | ------------------ |
| Lenguaje         | TypeScript en todo el stack                                                           |                    |
| Runtime y gestor | **Bun** (instalación, workspaces, scripts, `bun test`, imagen `oven/bun`)             | D5                 |
| Repositorio      | **Uno solo**, con Bun workspaces. Microservicios de verdad en runtime                 | D4, doc 06         |
| ORM              | **Drizzle** + `drizzle-kit` (compatible con Bun)                                      | D9                 |
| Backend          | Hexagonal + DDD, por servicio                                                         | doc 04             |
| Frontend         | **Next.js** App Router                                                                | doc 11             |
| Base de datos    | **Aurora PostgreSQL Serverless v2**, un schema + un rol por servicio                  | D1, doc 03         |
| Identidad        | **Amazon Cognito** (IdP) + `identity-access-service` (perfil y roles)                 | D2, doc 08         |
| Mensajería       | **EventBridge** (bus `edtech-domain-events`) + **SQS** con DLQ por consumidor         | D12, doc 05        |
| Contenedores     | Docker → **ECR** (uno por servicio) → **ECS Fargate** (un servicio por microservicio) | doc 07             |
| Entrada HTTP     | **Un ALB** con listener rules por path. **No** API Gateway, **no** App Mesh           | D10, D6, doc 07 §5 |
| Estático         | S3 + CloudFront con OAC, + Route53, ACM, WAF                                          | doc 07             |
| IaC              | **Terraform**, backend S3 + DynamoDB, **un state por módulo y por servicio**          | doc 07 §3          |
| IA               | **Amazon Bedrock** (agente nativo), invocado asíncronamente por SQS                   | doc 10             |
| Pagos            | **PayPal** (solo)                                                                     | doc 09             |
| Región           | **`us-east-1`**                                                                       | D15                |
| Entornos         | Solo **`dev`** se aplica. `prod` escrito, detrás de `apply_prod = false`              | D16                |

---

## 4. ARQUITECTURA — ESTÁNDAR OBLIGATORIO

**El doc 04 tiene el estándar en TypeScript real, con un caso de uso completo.
Cópialo, no lo reinterpretes.** Resumen de lo que el harness verifica:

- **Regla de dependencia:** `domain/` no importa frameworks (ni Express, ni Drizzle, ni
  AWS SDK, ni nada fuera del shared-kernel). `application/` no importa `Request`/`Response`
  ni el SDK. Solo `infrastructure/` toca ORM, framework y SDK.
- **CommandBus/QueryBus** internos, sin ports de entrada explícitos.
- **Ports de salida** en `domain/ports-out/`, incluido `IEventPublisher` (del kernel).
- **Validez por construcción**: sin setters públicos, Value Objects inmutables.
- **Eventos de dominio** registrados por la entidad, extraídos con `pullEvents()`,
  publicados por el handler **después de persistir**.
- **Result pattern** (`Ok`/`Err`) en `application/`; **prohibido `try/catch`** ahí.
- **Sin sufijo `Dto`**: entrada = `Command`/`Query`, salida = `...Response`.
- **Controlador único por servicio**, que no conoce excepciones de dominio (mapa explícito
  código de dominio → HTTP).
- **Estructura de carpetas** del doc 04 §10, idéntica en los seis servicios. La verifica
  `tools/check-structure.ts`.

> **Hueco conocido, doc 04 §6:** entre `guardar()` y `publish()` un crash pierde el evento.
> **No implementes outbox en Fase 1** — está en la deuda (B1). Implementa el job de
> reconciliación que indica R3 y sigue.

### Mensajería (doc 05)

- Bus único `edtech-domain-events`. Una cola + DLQ **por consumidor** (no por evento).
- **Catálogo de 26 eventos cerrado** en el doc 05 §2, con productor, consumidores y
  payload. **No inventes eventos nuevos**: si hace falta uno, agrégalo al doc primero y
  anótalo en `DECISIONS.md`.
- Nomenclatura: `<contexto>.<evento-kebab>.v<N>`. Envelope del doc 05 §3, con
  `eventId`, `occurredAt`, `correlationId`.
- **Idempotencia obligatoria** en todo consumidor: tabla `processed_events` por schema
  (doc 03 §3), con la plantilla del doc 05 §6. Léela entera: las tres decisiones que
  explica (INSERT primero, ACK sin handler, ACK en error de negocio) son fáciles de
  hacer al revés.
- **Comunicación síncrona: solo la excepción del doc 05 §7**, con timeout y fallback.
  Ninguna escritura cruzada síncrona, nunca.

### Aislamiento (doc 06)

Un repo, pero las fronteras son reales y las verifica el harness:

- **A4:** ningún import entre `services/<a>/` y `services/<b>/`. Solo
  `@edtech/shared-kernel` es dependencia compartida.
- **A5:** ningún repositorio menciona el schema de otro servicio. Sin JOINs entre schemas.
- Los datos ajenos se resuelven por **proyección local alimentada por eventos** (D14,
  doc 03 §10), o el evento trae el dato.
- **Regla de los tres usos** para el shared-kernel (doc 06 §3.1), con ADR por adición.

---

## 5. FRONTEND

Doc 11. Las 14 pantallas de §2, los tokens de §3, la gamificación de §4, accesibilidad de
§6, y las cuatro condiciones de §7 que dejan la API lista para Flutter (que **no** se
construye en Fase 1).

El frontend consume las APIs por el ALB (`/api/<servicio>/*`). **Nunca conoce colas,
eventos ni el bus.**

---

## 6. INFRAESTRUCTURA

Doc 07 completo: módulos, orden de aplicación, convención de nombres (§2), states
separados (§3), ALB (§5), cómputo (§6), observabilidad (§8), NAT y endpoints (§9),
seguridad (§10).

Paridad local: doc 13. `docker compose` con Postgres + LocalStack + los 6 servicios + web

- un nginx que replica las listener rules del ALB, y un emisor JWT local que sustituye a
  Cognito. **Lee el doc 13 §7**: dice qué NO reproduce el entorno local, y es la razón de que
  F4-bis exista.

---

## 7. AGENTE DE IA — FLASHCARDS

Doc 10 completo. Puntos que no se pueden hacer de otra forma:

- **El model ID se resuelve con la CLI en tiempo de build** (doc 10 §2). **No lo
  hardcodees.** Verifica que el modelo esté **habilitado** en la cuenta, no solo que
  exista. Prefiere un inference profile (`us.anthropic.…`) si está disponible.
- Disparo asíncrono: `catalog.contenido-actualizado.v1` → SQS → worker → Bedrock.
  Dos colas, no una (doc 10 §1).
- **HITL sin excepción**: ninguna tarjeta llega al estudiante sin aprobación. El filtro
  `estado = 'PUBLICADA'` va **en el repositorio**, no en el controlador (I-8).
- Caché por `contenido_hash`: no se regenera contenido que no cambió.
- En local, `GENERADOR_FLASHCARDS=fake`. Bedrock real solo en F11, contra AWS `dev`.

---

## 8. FRONTERAS ENTRE SERVICIOS

- Ningún servicio importa código fuente de otro.
- Ningún servicio se conecta al schema de otro.
- Escritura entre servicios: **siempre** por evento.
- Lectura entre servicios: proyección propia; y si no hay más remedio, la API HTTP pública
  del otro, con timeout, fallback y justificación en `DECISIONS.md`.
- Cada servicio publica su `openapi.yaml` y su `events-catalog.md`.

---

## 9. PAGOS — PAYPAL

Doc 09 completo. Lo crítico:

- `PasarelaPagoPort` (§1) — el dominio no sabe que existe PayPal.
- Flujo de compra §2, incluido el **polling honesto** del frontend tras capturar.
- Webhook §3: **verificación de firma sobre el cuerpo crudo**. Monta
  `express.raw({type:'application/json'})` en esa ruta **antes** del `express.json()`
  global. Es el error más común de esta integración y deja todos los pagos sin confirmar.
- El webhook responde en < 200 ms y procesa por cola interna con DLQ (§4).
- **`payments.pago-confirmado.v1` se emite solo tras captura confirmada por PayPal.**
- Idempotencia en dos capas: `paypal_event_id` y `processed_events.event_id`.
- Casos borde resueltos en §8 — impleméntalos, están todos.

### 9.1 Credenciales (completar ANTES de pegar este prompt)

> ⚠ **Seguridad.** No dejes este documento con credenciales reales en ningún repositorio.
> Trátalo como un input efímero de la sesión.

```
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=<VACIO_A_PROPOSITO — lo creas tú, ver abajo>
PAYPAL_BUSINESS_EMAIL=
MONEDA_DEFAULT=USD
```

Los datos están en `credentials.md` (raíz del repo).

**Tu primera acción con estos valores:** subirlos a Secrets Manager como
`edtech/dev/paypal` y **no volver a escribirlos en texto plano en ningún archivo** — ni en
`DECISIONS.md`, ni en un `.env` versionado, ni en un log, ni en un comentario. Después,
trabaja siempre contra Secrets Manager.

**`PAYPAL_WEBHOOK_ID` llega vacío a propósito y no debes pedirlo.** No se puede crear antes
de que exista un endpoint público, y `payments-service` no existe hasta F8. Lo creas tú en
F8, por API, contra la URL del ALB de `dev` —que para entonces ya está desplegado desde
F4-bis y es estable, a diferencia de un túnel de ngrok:

```
POST https://api-m.sandbox.paypal.com/v1/notifications/webhooks
{ "url": "https://<alb-dev>/api/payments/webhook",
  "event_types": [{"name":"CHECKOUT.ORDER.APPROVED"},{"name":"PAYMENT.CAPTURE.COMPLETED"},
                  {"name":"PAYMENT.CAPTURE.DENIED"},{"name":"PAYMENT.CAPTURE.REFUNDED"}] }
```

Guarda el `id` que devuelve en `edtech/dev/paypal` como `webhookId`. Si el webhook ya
existía (`GET /v1/notifications/webhooks` lo lista), reutilízalo en vez de crear otro:
PayPal limita cuántos webhooks admite una app.

Si falta **cualquiera de los otros cuatro** campos, ese sí es el único caso en el que debes
detenerte y pedirlos.

---

## 10. HARNESS

Doc 12 completo. `bun run harness` = arch + estructura + convenciones + tests, y es lo que
corre en el pre-commit y en CI.

1. Reglas de dependencia entre capas (dependency-cruiser, doc 12 §2).
2. **Aislamiento entre servicios** por AST, no por regex (A4/A5).
3. Lint de convenciones propias: sin `Dto`, sin `setX()` público, sin `try/catch` en
   `application/`, sin `process.env` fuera de `config/`, sin `new Date()` en `domain/`.
4. Verificación de estructura de carpetas, **incluida la correspondencia entre
   `domain/events/` y el catálogo del doc 05**.
5. Tests: dominio, aplicación con dobles, persistencia, **idempotencia por consumidor**,
   **contrato de los 26 eventos**, y el test de fuga de respuestas correctas (I-5).
6. **El test negativo del harness** (doc 12 §6): archivos que violan A1/A4/A5 a propósito y
   el check debe fallar. **Esto es obligatorio** — sin él no sabes si tu harness analiza
   algo o pasa siempre en verde.
7. Pre-commit con Husky (solo lo rápido) + CI con path filters y **OIDC**, nunca claves
   largas. Tag de imagen = SHA del commit, nunca `latest`. `apply` de `prod` jamás
   automático.
8. ADR ligero por cada adición al shared-kernel.

**No avances de servicio si el harness falla para el servicio actual.**

---

## 11. PLAN DE EJECUCIÓN

**Sigue el doc 14, fase por fase, con su verificación.** Orden:

```
F0 cimientos → F1 shared-kernel + harness → F2 infra base AWS
  → F3 identity-access → F4 catalog → F4-bis PRIMER DEPLOY REAL
  → F5 enrollment-progress → F6 gamification → F7 flashcards (fake)
  → F8 payments (PayPal real) → F9 web-app
  → F10 despliegue completo dev → F11 Bedrock real → F12 CI + aceptación + cierre
```

**F4-bis no es opcional y no se mueve al final.** Desplegar un servicio real a AWS con solo
`catalog` escrito es lo que hace que los problemas de IAM, security groups, health checks y
arranque en Fargate se arreglen **una vez** en lugar de seis.

Si hay que recortar, el orden está en el doc 14 §final. **Nunca recortes** F1, F2, F4-bis ni
la idempotencia de los consumidores.

---

## 12. CRITERIOS DE ACEPTACIÓN

Los del doc 00 §DoD y el checklist completo del doc 15 §3. Los que más se olvidan:

- [ ] El **test negativo del harness** demuestra que las reglas fallan ante código malo.
- [ ] **I-4 verificado por comando**: `psql` con las credenciales de un servicio contra la
      tabla de otro devuelve `permission denied`.
- [ ] **I-2 verificado**: reprocesar un evento no duplica su efecto, en cada consumidor.
- [ ] **I-12 verificado**: ningún secreto en el repositorio ni en su historial de Git.
- [ ] **I-14 verificado**: toda cola tiene DLQ y toda DLQ tiene alarma.
- [ ] **Budget con alarma al 80 % creado en F2**, no al final (R1).
- [ ] **El procedimiento de apagado del doc 16 §4 ejecutado al menos una vez**, no solo
      escrito.
- [ ] Flujo completo demostrable **en local y en AWS `dev`**: catálogo → registro Cognito →
      test de nivelación → curso asignado → pago PayPal sandbox → `pago-confirmado` propaga
      → matrícula → lección completada → `tomo-completado` → insignia y certificado →
      flashcards generadas, aprobadas por admin y visibles al estudiante.

---

## 13. LO QUE NO DEBES HACER

- No cambies las decisiones D1-D20 del doc 00.
- No inventes eventos fuera del catálogo del doc 05 §2.
- No hardcodees el model ID de Bedrock.
- No implementes outbox, multi-tenant, App Mesh, API Gateway, Flutter, push notifications
  ni OpenSearch: son deuda declarada (doc 15 §4), no olvidos.
- No apliques `prod`.
- No escribas credenciales en ningún archivo.
- No crees repos Git separados por servicio.
- No uses pnpm ni npm: es Bun.
- No pongas `transform` en un `:hover`.
