# Decisiones de `payments`

Los supuestos globales (D1–D20 y A-01…) están en el [`DECISIONS.md` de la
raíz](../../DECISIONS.md). Acá va solo lo propio de este servicio: qué decide,
qué no, y por qué está hecho así.

## Qué posee

- El esquema `payments`: órdenes, capturas, reembolsos y la bitácora de webhooks.
- La relación con PayPal y el secreto `edtech/dev/paypal` — es el **único** servicio que
  puede leerlo.

## Qué NO posee

- La matrícula: emite `pago-confirmado` y `enrollment-progress` decide.
- El precio de catálogo: lo mantiene en una proyección alimentada por eventos de
  `catalog`.

## Decisiones propias

- **Único servicio en Fargate normal, no Spot** (doc 07 §6): perder un webhook por una
  interrupción sí duele.
- **Idempotencia en dos capas**: `paypal_event_id` único además del `processed_events`
  común. PayPal reintenta por su cuenta y el mismo evento puede llegar por dos caminos.
- **La firma se verifica sobre el cuerpo CRUDO.** El router de webhook monta
  `raw({ type: 'application/json' })` antes del router JSON; cualquier middleware que
  reserialice el body rompe la firma sin que nadie lo note hasta que un pago se pierde.
- **Siempre responde 200**, incluso con firma inválida, cuerpo no-JSON o sin `id`
  (A-37): cualquier otra respuesta le confirma a quien sondea que llegó a un endpoint vivo.
  El evento queda registrado con `firma_valida = false` y no se procesa.
- **Por la cola viaja solo el `paypalEventId`** (A-36): la bitácora se escribe antes de
  encolar y es la fuente de verdad; mandar el payload lo duplicaría y chocaría con el
  límite de 256 KB de SQS.

## Lecturas y escrituras hacia afuera

- Consume `catalog.curso-publicado.v1`, `catalog.precio-actualizado.v1` y
  `catalog.curso-despublicado.v1` para su proyección de precios.
- Emite `orden-creada`, `pago-confirmado`, `pago-fallido` y `pago-reembolsado`.
- Habla con la API de PayPal por internet (por eso la salida por NAT) y recibe sus webhooks
  por el borde HTTPS (A-34/A-35).
