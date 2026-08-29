# payments-service — catálogo de eventos

## Publica (al bus `edtech-domain-events`)

| Evento                         | Payload                                                               | Cuándo                                      |
| ------------------------------ | --------------------------------------------------------------------- | ------------------------------------------- |
| `payments.orden-creada.v1`     | `ordenId, usuarioId, cursoId, monto, moneda`                          | Se crea la orden con el monto congelado     |
| `payments.pago-confirmado.v1`  | `ordenId, usuarioId, cursoId, monto, moneda, capturaId, confirmadoAt` | **Solo** tras captura confirmada por PayPal |
| `payments.pago-fallido.v1`     | `ordenId, usuarioId, cursoId, motivo`                                 | Captura denegada                            |
| `payments.pago-reembolsado.v1` | `ordenId, usuarioId, cursoId, monto, reembolsoId`                     | Webhook de reembolso                        |

`pago-confirmado` es el evento que habilita matrículas: emitirlo antes de la
captura habilitaría cursos que no se pagaron (doc 09 §4).

## Consume (cola `edtech-dev-payments`)

| Evento                          | Efecto                                                              |
| ------------------------------- | ------------------------------------------------------------------- |
| `catalog.curso-publicado.v1`    | Alimenta `precios_proyeccion` (D14): el checkout no llama a catalog |
| `catalog.precio-actualizado.v1` | Actualiza el precio y su versión                                    |
| `catalog.curso-despublicado.v1` | Marca `publicado=false`: no admite compras nuevas                   |

## Cola interna

`edtech-dev-payments-webhooks` — el endpoint HTTP verifica la firma, registra el
crudo en `webhooks_paypal` y encola; el worker hace el trabajo con reintentos y
DLQ. El endpoint responde en < 200 ms porque **PayPal reintenta si tarda**, y
esos reintentos son la fuente clásica del doble cobro (doc 09 §4).

## Webhooks de PayPal suscritos

| Evento de PayPal            | Efecto                                                                    |
| --------------------------- | ------------------------------------------------------------------------- |
| `CHECKOUT.ORDER.APPROVED`   | Orden `APROBADA`; captura desde el worker si el flujo síncrono no ocurrió |
| `PAYMENT.CAPTURE.COMPLETED` | Confirma la captura → `pago-confirmado`                                   |
| `PAYMENT.CAPTURE.DENIED`    | `FALLIDA` → `pago-fallido`                                                |
| `PAYMENT.CAPTURE.REFUNDED`  | `REEMBOLSADA` → `pago-reembolsado` → enrollment revoca                    |

## Idempotencia en dos capas

1. `webhooks_paypal.paypal_event_id` (UNIQUE) — contra los reintentos de **PayPal**.
2. `processed_events.event_id` — contra las reentregas de **SQS**.

Son capas distintas: quitar una deja un agujero real (doc 03 §9).
