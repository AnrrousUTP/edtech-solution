# 05 — Eventos, EventBridge y SQS

> **El catálogo de eventos de este documento es cerrado.** Fable no inventa eventos nuevos
> sin agregarlos acá primero. Cada evento tiene productor, consumidores, payload y versión;
> el contract test (doc 12 §5) verifica que lo publicado coincida con lo escrito.

## 1. Topología

```
                    ┌──────────────────────────────────────────┐
   6 servicios ────►│  EventBridge bus: edtech-domain-events    │
   (publican)       └───────────────┬──────────────────────────┘
                                    │  reglas por patrón de eventType
     ┌────────────┬────────────┼────────────┬────────────┬────────────┐
     ▼            ▼            ▼            ▼            ▼            ▼
sqs-enrollment sqs-gamif  sqs-flashcards sqs-identity sqs-payments sqs-notifications
     │            │            │            │            │            │
    DLQ          DLQ          DLQ          DLQ          DLQ          DLQ
     │            │            │            │            │            │
     ▼            ▼            ▼            ▼            ▼            ▼
 poller del   poller del   poller +     poller del   poller del   worker → SES
 servicio     servicio     Bedrock      servicio     servicio
```

**Un bus único** (D12). Un bus por servicio complicaría las reglas sin dar nada: el
aislamiento ya lo dan las colas y las políticas IAM.

**Una cola por consumidor** (seis: enrollment, gamification, flashcards, identity, payments
y notifications), no una por evento. Cada servicio consume su cola en orden y
despacha por `eventType` dentro del poller. Menos recursos que administrar y el orden
relativo se conserva mejor.

### Colas internas (no reciben de EventBridge)

| Cola | Productor | Consumidor | Para qué |
|---|---|---|---|
| `sqs-payments-webhooks` | controlador HTTP de payments | worker de payments | Responder a PayPal en <200 ms y procesar con reintentos (doc 09 §4) |
| `sqs-gamification-certificados` | gamification | worker de gamification | Generar el PDF del certificado, que tarda segundos |
| `sqs-flashcards-generacion` | poller de flashcards | worker de flashcards | Invocar a Bedrock, que tarda decenas de segundos (doc 10 §3) |

## 2. Catálogo de eventos

Nomenclatura: `<contexto>.<evento-en-kebab>.v<N>`. La `v` es **parte del tipo**: una
versión nueva es un evento nuevo, y las reglas de EventBridge apuntan a la versión.

### 2.1 `identity-access-service`

| Evento | Payload | Consumidores |
|---|---|---|
| `identity.usuario-registrado.v1` | `usuarioId, email, nombreVisible, rol` | notifications (bienvenida), gamification (crea perfil) |
| `identity.nivel-actualizado.v1` | `usuarioId, nivelAnterior, nivelNuevo, origen` | — (auditoría) |
| `identity.perfil-actualizado.v1` | `usuarioId, campos[]` | — |

### 2.2 `catalog-service`

| Evento | Payload | Consumidores |
|---|---|---|
| `catalog.curso-publicado.v1` | `cursoId, slug, titulo, tecnologia, nivelMin, nivelMax, precio, moneda, versionPrecio, estructura[]` | enrollment (proyección), payments (proyección de precios) |
| `catalog.curso-despublicado.v1` | `cursoId, motivo` | enrollment, payments |
| `catalog.contenido-actualizado.v1` | `cursoId, tomoId, contenidoHash, lecciones[{id,titulo,bloquesS3Key}]` | flashcards (dispara generación), enrollment (refresca proyección) |
| `catalog.precio-actualizado.v1` | `cursoId, montoAnterior, montoNuevo, moneda, versionPrecio` | payments |

`estructura[]` es el árbol tomo→lección que enrollment guarda en su proyección (doc 03 §6).
Va **dentro del evento** a propósito: evita que enrollment tenga que llamar a catalog.

### 2.3 `enrollment-progress-service`

| Evento | Payload | Consumidores |
|---|---|---|
| `enrollment.matricula-creada.v1` | `matriculaId, usuarioId, cursoId, origen, ordenId?` | notifications, gamification |
| `enrollment.leccion-completada.v1` | `matriculaId, usuarioId, cursoId, tomoId, leccionId, completadaAt` | gamification (racha, puntos) |
| `enrollment.tomo-completado.v1` | `matriculaId, usuarioId, cursoId, tomoId, puntaje` | gamification, flashcards (habilita el mazo de repaso) |
| `enrollment.curso-completado.v1` | `matriculaId, usuarioId, cursoId, cursoTitulo, completadoAt` | gamification (insignia + certificado menor), identity (sube nivel), notifications |
| `enrollment.carrera-completada.v1` | `usuarioId, carreraId, carreraTitulo` | gamification (certificado mayor), notifications |
| `enrollment.evaluacion-aprobada.v1` | `usuarioId, intentoId, tomoId, puntaje, perfecto` | gamification (insignia `EVALUACION_PERFECTA`) |
| `enrollment.evaluacion-reprobada.v1` | `usuarioId, intentoId, tomoId, puntaje` | — |
| `enrollment.test-nivelacion-completado.v1` | `usuarioId, intentoId, nivelResultante, puntaje` | identity (fija el nivel con origen `TEST`) |

`cursoTitulo` viaja dentro del evento para que gamification pueda emitir el certificado sin
consultar a catalog. Es duplicación deliberada (doc 03 §10, opción 2).

### 2.4 `gamification-service`

| Evento | Payload | Consumidores |
|---|---|---|
| `gamification.insignia-otorgada.v1` | `usuarioId, criterio, referenciaId, otorgadaAt` | notifications |
| `gamification.certificado-emitido.v1` | `certificadoId, usuarioId, tipo, referenciaId, titulo, codigoVerificacion` | notifications |
| `gamification.racha-extendida.v1` | `usuarioId, rachaActual` | notifications (solo en hitos: 7, 30, 100) |
| `gamification.racha-rota.v1` | `usuarioId, rachaPerdida` | notifications |

### 2.5 `flashcards-service`

| Evento | Payload | Consumidores |
|---|---|---|
| `flashcards.mazo-generado.v1` | `mazoId, tomoId, cursoId, version, cantidadTarjetas, modeloUsado` | notifications (avisa al admin que hay revisión pendiente) |
| `flashcards.mazo-publicado.v1` | `mazoId, tomoId, cursoId, version, cantidadPublicadas` | notifications |
| `flashcards.generacion-fallida.v1` | `tomoId, motivo, intentos` | notifications (alerta al admin) |

### 2.6 `payments-service`

| Evento | Payload | Consumidores |
|---|---|---|
| `payments.orden-creada.v1` | `ordenId, usuarioId, cursoId, monto, moneda` | — |
| `payments.pago-confirmado.v1` | `ordenId, usuarioId, cursoId, monto, moneda, capturaId, confirmadoAt` | **enrollment** (habilita matrícula), notifications |
| `payments.pago-fallido.v1` | `ordenId, usuarioId, cursoId, motivo` | notifications |
| `payments.pago-reembolsado.v1` | `ordenId, usuarioId, cursoId, monto, reembolsoId` | **enrollment** (revoca matrícula), notifications |

## 3. Sobre público de un evento

Todo evento va al bus con este envelope. `detail-type` = `eventType`, para que las reglas
sean legibles.

```json
{
  "Source": "edtech.enrollment",
  "DetailType": "enrollment.curso-completado.v1",
  "EventBusName": "edtech-domain-events",
  "Detail": {
    "eventId": "b3f1…",
    "eventType": "enrollment.curso-completado.v1",
    "occurredAt": "2026-08-26T14:03:11.412Z",
    "aggregateId": "9a20…",
    "correlationId": "req-7f2c…",
    "payload": { "matriculaId": "9a20…", "usuarioId": "…", "cursoId": "…",
                 "cursoTitulo": "CSS desde Cero", "completadoAt": "2026-08-26T14:03:11.400Z" }
  }
}
```

- `eventId` — clave de idempotencia (D13). Lo genera la entidad al registrar el evento, no
  el publisher: si el publisher reintenta, el id es el mismo.
- `correlationId` — viaja desde la request HTTP original y se propaga a todo evento
  derivado. Es lo que hace legible una traza que cruza tres servicios (doc 07 §8).
- `occurredAt` — cuándo pasó en el dominio, **no** cuándo se publicó.

## 4. Reglas de EventBridge

Una regla por (consumidor, grupo de eventos que le interesan). Terraform en el módulo
`messaging/`.

```hcl
resource "aws_cloudwatch_event_rule" "enrollment_desde_payments" {
  name           = "edtech-dev-enrollment-desde-payments"
  event_bus_name = aws_cloudwatch_event_bus.dominio.name
  event_pattern  = jsonencode({
    "detail-type" = ["payments.pago-confirmado.v1", "payments.pago-reembolsado.v1"]
  })
}

resource "aws_cloudwatch_event_target" "enrollment_desde_payments" {
  rule           = aws_cloudwatch_event_rule.enrollment_desde_payments.name
  event_bus_name = aws_cloudwatch_event_bus.dominio.name
  arn            = aws_sqs_queue.enrollment.arn
  dead_letter_config { arn = aws_sqs_queue.enrollment_dlq_entrega.arn }   # fallo de ENTREGA
  retry_policy { maximum_event_age_in_seconds = 3600, maximum_retry_attempts = 3 }
}
```

> **Dos DLQ distintas y no son lo mismo.** La `dead_letter_config` del *target* captura
> eventos que EventBridge **no pudo entregar** a la cola (permisos, cola inexistente). La
> `redrive_policy` de la *cola* captura mensajes que el **consumidor no pudo procesar**.
> Confundirlas hace que un fallo quede invisible. Ambas existen, con nombres distintos.

Mapa completo de reglas:

| Regla | Patrón (`detail-type`) | Destino |
|---|---|---|
| `enrollment-desde-payments` | `payments.pago-confirmado.v1`, `payments.pago-reembolsado.v1` | `sqs-enrollment` |
| `enrollment-desde-catalog` | `catalog.curso-publicado.v1`, `catalog.curso-despublicado.v1`, `catalog.contenido-actualizado.v1` | `sqs-enrollment` |
| `gamification-desde-enrollment` | `enrollment.leccion-completada.v1`, `enrollment.tomo-completado.v1`, `enrollment.curso-completado.v1`, `enrollment.carrera-completada.v1`, `enrollment.evaluacion-aprobada.v1` | `sqs-gamification` |
| `gamification-desde-identity` | `identity.usuario-registrado.v1` | `sqs-gamification` |
| `flashcards-desde-catalog` | `catalog.contenido-actualizado.v1` | `sqs-flashcards` |
| `identity-desde-enrollment` | `enrollment.curso-completado.v1`, `enrollment.test-nivelacion-completado.v1` | `sqs-identity` |
| `payments-desde-catalog` | `catalog.curso-publicado.v1`, `catalog.precio-actualizado.v1`, `catalog.curso-despublicado.v1` | `sqs-payments` |
| `notificaciones` | prefijo `identity.`, `enrollment.`, `gamification.`, `payments.`, `flashcards.` (filtrado fino en el worker) | `sqs-notifications` |

## 5. Configuración de colas

```hcl
resource "aws_sqs_queue" "enrollment" {
  name                       = "edtech-dev-enrollment"
  visibility_timeout_seconds = 180          # ≥ 6× el timeout del handler
  message_retention_seconds  = 345600       # 4 días
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.enrollment_dlq.arn
    maxReceiveCount     = 5
  })
  kms_master_key_id = aws_kms_key.mensajeria.id
}

resource "aws_sqs_queue" "enrollment_dlq" {
  name                      = "edtech-dev-enrollment-dlq"
  message_retention_seconds = 1209600       # 14 días, el máximo
  kms_master_key_id         = aws_kms_key.mensajeria.id
}
```

| Parámetro | Valor | Por qué |
|---|---|---|
| `visibility_timeout` | 180 s (600 s en flashcards) | Debe superar con margen lo que tarda el handler. Corto → el mensaje se re-entrega mientras todavía se procesa y el efecto se duplica (lo salva la idempotencia, pero es trabajo tirado) |
| `maxReceiveCount` | 5 | Suficiente para superar un fallo transitorio de BD; no tanto como para martillar un error permanente |
| `message_retention` cola | 4 días | Ventana realista para arreglar y reprocesar |
| `message_retention` DLQ | 14 días | Máximo de SQS. Un mensaje en DLQ es un incidente y merece tiempo |
| Long polling | `wait_time_seconds = 20` en el receive | Menos llamadas vacías = menos costo y menos latencia |
| Cifrado | KMS con clave propia | Los payloads llevan `usuarioId` y montos |

**Alarma obligatoria (doc 07 §8):** `ApproximateNumberOfMessagesVisible > 0` en cualquier
DLQ durante 5 minutos → alarma de CloudWatch. Una DLQ que se llena en silencio es la forma
más común de perder eventos sin enterarse.

## 6. Idempotencia en el consumidor

Plantilla obligatoria. Se repite igual en los seis servicios.

```ts
// infrastructure/in/messaging/sqs.poller.ts
async function procesar(mensaje: SqsMessage) {
  const sobre = parseSobre(mensaje.Body)          // valida el envelope; si no valida → DLQ directo

  const nuevo = await db.transaction(async tx => {
    const r = await tx.insert(processedEvents)
      .values({ eventId: sobre.eventId, eventType: sobre.eventType, resultado: 'OK' })
      .onConflictDoNothing()
      .returning({ id: processedEvents.eventId })
    return r.length > 0
  })

  if (!nuevo) { log.info('evento ya procesado', { eventId: sobre.eventId }); return ACK }

  const handler = HANDLERS[sobre.eventType]
  if (!handler) { log.warn('evento sin handler', { eventType: sobre.eventType }); return ACK }

  const r = await handler(sobre)                  // traduce a Command y despacha por el bus
  if (isOk(r)) return ACK
  if (esErrorDeNegocio(r.error)) { log.error('evento inaplicable', r.error); return ACK }
  return NACK                                     // infraestructura → reintento → DLQ
}
```

Tres decisiones que hay que entender antes de copiarla:

1. **El `INSERT` va primero y en su propia transacción.** Si fuera después del efecto, un
   crash entre medias re-ejecutaría el efecto. Va antes: el peor caso es marcar procesado
   algo que falló, y ese caso lo cubre el `NACK`… salvo que ya se hizo commit. Por eso, si
   el efecto de negocio **no** es idempotente por sí mismo, el `INSERT` y el efecto deben
   ir en **la misma** transacción (es lo que hace el ejemplo del doc 03 §3). La versión de
   arriba vale cuando el efecto ya es idempotente por su propia PK.
2. **Un evento sin handler se hace ACK, no NACK.** Un servicio suscrito a un patrón amplio
   recibe eventos que no le importan; hacer NACK los mandaría a DLQ y llenaría de ruido la
   alarma que sí importa.
3. **Un error de negocio se hace ACK.** Si `PagoConfirmadoEvent` llega para un curso que ya
   no existe, reintentar cinco veces no lo va a arreglar. Se registra y se sigue.

## 7. Comunicación síncrona: cuándo sí

**Regla:** por defecto, no. Y toda excepción se escribe en `DECISIONS.md` con su motivo.

En Fase 1 hay **exactamente una**: el panel de admin de flashcards llama a
`GET /api/catalog/cursos/:id` para mostrar el contexto del contenido junto a las tarjetas
en revisión. Cumple las tres condiciones que hacen aceptable una llamada síncrona:

- Es una **lectura**, nunca una escritura.
- Está **fuera del camino caliente** (pantalla de admin, no flujo del estudiante).
- Tiene **timeout (2 s) y degradación**: si catalog no responde, la pantalla muestra las
  tarjetas sin el contexto, con un aviso. No falla.

**Prohibido sin excepción:** una escritura cruzada síncrona. `payments` no llama a
`enrollment` para crear la matrícula. Emite el evento.

## 8. Versionado de eventos

Cambio **compatible** (agregar un campo opcional al payload): misma versión, se despliega
el productor primero.

Cambio **incompatible** (quitar un campo, cambiar un tipo, cambiar el significado):

1. Se publica `...v2` **en paralelo** con `...v1`. El productor emite los dos.
2. Se agrega la regla de EventBridge para `v2` y se actualizan los consumidores.
3. Cuando ningún consumidor lee `v1`, se deja de emitir y se borra la regla.

Nunca se cambia el payload de una versión ya publicada. El contract test (doc 12 §5) falla
si el JSON emitido deja de validar contra el schema congelado de esa versión, y eso es
precisamente lo que evita romper a otro servicio en silencio.
