# 14 — Fases de ejecución

> **Cada fase deja el sistema en un estado verificable y tiene un comando que lo
> demuestra.** No se avanza con el harness en rojo (mega-prompt §10).
>
> **Regla transversal:** el primer despliegue real a AWS (F10 en el orden del mega-prompt)
> se **adelanta a F4-bis**. El motivo está en el doc 13 §7: IAM, security groups y red no
> se prueban en local, y descubrir que un rol de tarea no puede leer un secreto cuando ya
> hay seis servicios escritos es la peor forma de descubrirlo. Un servicio desplegado de
> verdad y temprano paga por sí solo.

## Orden

```
F0 cimientos ─→ F1 shared-kernel + harness ─→ F2 infra base AWS
   ─→ F3 identity-access ─→ F4 catalog ─→ [F4-bis PRIMER DEPLOY REAL]
   ─→ F5 enrollment-progress ─→ F6 gamification ─→ F7 flashcards (con fake)
   ─→ F8 payments (PayPal real) ─→ F9 web-app
   ─→ F10 despliegue completo dev ─→ F11 Bedrock real ─→ F12 CI + aceptación + cierre
```

## Dimensionamiento

| Fase | Días | De dónde sale |
|---|---|---|
| F0 cimientos | 0,5 | Estructura, tsconfig, compose base, docs |
| F1 shared-kernel + harness | 2,5 | 11 archivos del kernel + 4 herramientas de check + el test negativo |
| F2 infra base AWS | 4 | 6 módulos Terraform + bootstrap de state + 6 schemas y roles |
| F3 identity-access | 2 | El más pequeño; incluye Cognito y las 2 Lambdas |
| F4 catalog | 3 | El de más entidades (8 tablas) y el CRUD de admin |
| **F4-bis primer deploy** | **1,5** | ECR + task def + servicio ECS + listener rule + los permisos IAM que fallen |
| F5 enrollment-progress | 3,5 | Absorbe Assessment: matrícula + progreso + intentos + proyección |
| F6 gamification | 2 | Insignias, certificados, racha, worker de PDF |
| F7 flashcards | 2 | Dominio + HITL + fake del generador |
| F8 payments | 3 | PayPal real, webhook, firma, cola interna, idempotencia doble |
| F9 web-app | 5 | 14 pantallas |
| F10 despliegue completo dev | 1,5 | Los 5 servicios restantes + edge + observabilidad |
| F11 Bedrock real | 2 | Agent + action group + Lambda + resolver el model ID |
| F12 CI + aceptación + cierre | 3 | 2 workflows + guion E2E + DECISIONS + READMEs |
| **Total** | **~35,5** | |

---

## F0 — Cimientos (0,5 d)

- Estructura de carpetas del doc 06 §2, `package.json` raíz con workspaces de Bun,
  `tsconfig.base.json` **sin alias hacia servicios** (doc 06 §4.1).
- `docker-compose.yml` con `postgres`, `localstack` y `jwt-local`.
- `.gitignore` con `.env*`, `*.tfvars` (salvo `*.example.tfvars`), `node_modules`, `.next`.
- `DECISIONS.md` inicializado con D1-D20 de este plan.

**Verificación:** `docker compose --profile base up -d && awslocal sqs list-queues`
responde. `bun install` termina sin errores.

## F1 — Shared kernel + harness (2,5 d)

- `packages/shared-kernel/` completo (doc 06 §3.1): `Result`, `DomainEvent`,
  `AggregateRoot`, `IEventPublisher`, `UniqueId`, `CommandBus`/`QueryBus`, cliente de
  EventBridge, poller SQS, lector de Secrets, middleware de auth y de errores, dobles de
  test.
- `tools/`: `arch-check.ts`, `check-structure.ts`, `lint-convenciones.ts`.
- `.dependency-cruiser.cjs` con las 5 reglas.
- **`tools/arch-check.test.ts` — el test negativo** (doc 12 §6).
- Husky + lint-staged.

**Verificación:** `bun run harness` pasa en verde con el repo vacío de servicios, **y** el
test negativo demuestra que falla ante código que viola A1, A4 y A5.

> Esta fase va antes que cualquier servicio a propósito. Escribir el harness después
> significa escribirlo para que pase con el código que ya existe, que es exactamente lo
> contrario de lo que sirve.

## F2 — Infraestructura base AWS (4 d)

- `infra/bootstrap/`: bucket de state versionado + tabla de locks (doc 07 §3).
- Módulos `network`, `security`, `database`, `messaging`, `storage`, `registry`.
- Aurora con los 6 schemas, 6 roles y sus secretos (doc 03 §1).
- Bus, 8 reglas, 6 colas + DLQ, 3 colas internas (doc 05 §4-§5).
- Alarma de DLQ desde el primer día.

**Verificación:**
```bash
aws events put-events --entries '[{"Source":"prueba","DetailType":"payments.pago-confirmado.v1",
  "EventBusName":"edtech-domain-events","Detail":"{\"eventId\":\"...\"}"}]'
aws sqs receive-message --queue-url <sqs-enrollment>     # el mensaje llegó
psql "$URL_CATALOG" -c "SELECT 1 FROM enrollment.matriculas"   # debe fallar: permission denied (I-4)
```

## F3 — `identity-access-service` (2 d)

Dominio (`Usuario`, `Nivel`), casos de uso (crear desde Cognito, actualizar perfil, subir
nivel), consumidor de `enrollment.curso-completado.v1` y
`enrollment.test-nivelacion-completado.v1`, User Pool + grupos + las 2 Lambdas (doc 08).

**Verificación:** registro en el Hosted UI → la fila aparece en `identity.usuarios` con
`id = sub` → el JWT valida contra el middleware del kernel → un **id token** enviado como
access token devuelve 401.

## F4 — `catalog-service` (3 d)

Las 8 tablas del doc 03 §5, CRUD de admin, API pública de catálogo, publicación con sus
invariantes, cálculo de `contenido_hash`, y los 4 eventos.

**Verificación:** crear curso → publicar → `catalog.curso-publicado.v1` llega a
`sqs-enrollment` y a `sqs-payments`. **Y el test de fuga (I-5):**
`GET /api/catalog/tomos/:id/evaluacion` no contiene `respuesta_correcta` en ninguna parte
del body.

## F4-bis — Primer despliegue real (1,5 d) ⚠

**La fase que el mega-prompt no tenía y que más riesgo elimina.** Desplegar `catalog` a AWS
`dev` de verdad: ECR, imagen construida con Bun, task definition, servicio ECS, target
group, listener rule, rol de tarea con permisos de mínimo privilegio.

Lo que aparece acá y no aparecería en local: permisos IAM faltantes, security groups mal
encadenados, el secreto que la tarea no puede leer, la imagen que no arranca en Fargate, la
migración que corre antes de que Aurora acepte conexiones, el health check con la ruta
equivocada.

**Verificación:** `curl https://<alb>/api/catalog/cursos` devuelve el seed desde AWS.

> Descubrir estos seis problemas con **un** servicio escrito cuesta un día. Descubrirlos con
> seis servicios escritos cuesta una semana, porque hay que arreglarlos seis veces.

## F5 — `enrollment-progress-service` (3,5 d)

Matrícula, progreso, intentos de evaluación (Assessment absorbido, D3), test de nivelación
con el algoritmo del doc 02 §2, proyección de catálogo, consumidores de
`payments.pago-confirmado.v1` / `pago-reembolsado.v1` / eventos de catalog, 8 eventos
publicados.

**Verificación:** poner a mano un `pago-confirmado` en el bus → la matrícula queda `ACTIVA`.
**Poner el mismo evento dos veces → sigue habiendo una sola matrícula** (I-2).

## F6 — `gamification-service` (2 d)

Perfil, insignias con su unicidad, certificados con código de verificación, racha con
ventana de gracia, worker de PDF por cola interna, consumidores de enrollment.

**Verificación:** completar un curso → insignia + certificado + PDF en S3 →
`GET /certificados/:codigo` verifica públicamente. Reprocesar `curso-completado` **no**
otorga una segunda insignia (I-7).

## F7 — `flashcards-service` (2 d, con fake)

Mazos, tarjetas, estados, HITL, panel de revisión, caché por hash, consumidor de
`catalog.contenido-actualizado.v1`, `FakeGeneradorFlashcards`.

**Verificación:** editar contenido en catalog → mazo `EN_REVISION` con 10 tarjetas →
`GET /api/flashcards/tomos/:id` como estudiante devuelve **0** → aprobar 6 → devuelve 6
(I-8). Editar una tilde y reemitir el evento → **no** se genera un mazo nuevo (caché).

## F8 — `payments-service` con PayPal real (3 d)

Órdenes, `PasarelaPagoPort` + gateway de PayPal, captura, webhook con **verificación de
firma sobre el cuerpo crudo**, cola interna, idempotencia doble, proyección de precios.

**Primer paso de la fase, antes de escribir el handler:** dar de alta el webhook por API
contra la URL del ALB de `dev` (que existe desde F4-bis) y guardar el `webhookId` en
`edtech/dev/paypal`. Alta idempotente: consultar los webhooks existentes y reutilizar
(doc 09 §6). El operador **no** provee este valor.

**Verificación:** compra completa en sandbox **contra AWS `dev`** (el webhook llega al ALB,
sin ngrok de por medio) → `pago-confirmado` → matrícula habilitada. Reenviar el mismo webhook → un solo efecto. Webhook con firma alterada →
registrado con `firma_valida = false` y **no procesado**.

## F9 — `web-app` (5 d)

Las 14 pantallas del doc 11 §2, tokens visuales, **sin hover con movimiento** (D19),
sesión Cognito con cookies httpOnly, accesibilidad.

**Verificación:** el flujo completo del doc 00 §DoD, a mano, en el navegador, contra
`docker compose`.

## F10 — Despliegue completo a `dev` (1,5 d)

Los 5 servicios restantes a ECS (repitiendo el patrón ya validado en F4-bis), módulos
`edge` (CloudFront + Route53 + ACM + WAF) y `observability` (dashboard + alarmas + X-Ray).

**Verificación:** el flujo completo, otra vez, pero contra AWS `dev`. Y las alarmas
disparan cuando deben: mandar un mensaje malformado a una cola y comprobar que llega a la
DLQ **y que la alarma avisa**.

## F11 — Bedrock real (2 d)

Resolver el model ID (doc 10 §2), módulo `ai/` (Agent + action group + Lambda), cambiar
`GENERADOR_FLASHCARDS` a `bedrock` en `dev`, cotejar la salida real contra el fake.

**Verificación:** editar un tomo en `dev` → mazo generado por el modelo real →
`modelo_usado` registrado → aprobar → visible al estudiante.

## F12 — CI, aceptación y cierre (3 d)

- `ci.yml` + `service.yml` con path filters y OIDC (doc 12 §8).
- Guion E2E completo, corrido de punta a punta contra `dev`.
- Los caminos que solo se prueban en AWS (doc 13 §7): federación social, MFA de admin,
  rotación de refresh, comportamiento de Aurora bajo carga.
- `DECISIONS.md` por servicio, `events-catalog.md` por servicio, `openapi.yaml` por
  servicio, README raíz con arranque local y despliegue.
- Checklist de cierre del doc 15 §3, completo.
- Medición de costo real de `dev` contra la estimación del doc 16, y **prueba del
  procedimiento de apagado**.

---

## Qué se puede recortar si hay que recortar

Por orden: **primero lo de arriba.**

1. **F11 (Bedrock real)** — el fake demuestra todo el flujo, incluido el HITL. Es lo único
   que se puede diferir sin romper la demostración de punta a punta.
2. **Pantallas 11 y 14** (verificación pública de certificado, métricas de admin) — útiles,
   no estructurales.
3. **El worker de PDF de F6** — mostrar el certificado en HTML y generar el PDF después.
4. **La racha completa de F6** — insignias y certificados son el núcleo; la racha es la
   capa de retención.

**Lo que no se recorta nunca:** F1 (harness), F2 (infra base), F4-bis (primer deploy) y la
idempotencia de los consumidores. Recortar cualquiera de esos cuatro no ahorra tiempo: lo
mueve a más adelante multiplicado.
