# 09 — Pagos con PayPal

> Decisión de negocio ya tomada: **solo PayPal**. Stripe no opera con cuentas peruanas sin
> una LLC extranjera; PayPal permite cuenta empresarial directa en Perú vinculada a banco
> local. El diseño detrás de `PasarelaPagoPort` deja la puerta abierta a Culqi o Mercado
> Pago sin tocar el dominio.
>
> **Los pasos para obtener las credenciales están en [`../CREDENCIALES-PAYPAL.md`](../CREDENCIALES-PAYPAL.md).**
> Ningún valor real se escribe en este documento ni en ningún otro del plan.

## 1. El puerto

```ts
// domain/ports-out/pasarela-pago.port.ts
export interface PasarelaPagoPort {
  crearOrden(input: {
    ordenId: string          // nuestro id, viaja como custom_id → nos deja conciliar
    monto: Dinero
    descripcion: string
    urlRetorno: string
    urlCancelacion: string
  }): Promise<Result<{ proveedorOrdenId: string; urlAprobacion: string }, PasarelaError>>

  capturar(proveedorOrdenId: string): Promise<Result<{
    capturaId: string
    montoCapturado: Dinero
    comision: Dinero
    neto: Dinero
    estado: 'COMPLETADA' | 'PENDIENTE' | 'DENEGADA'
  }, PasarelaError>>

  verificarFirmaWebhook(headers: Record<string, string>, cuerpoCrudo: string): Promise<boolean>

  reembolsar(capturaId: string, monto: Dinero, motivo: string):
    Promise<Result<{ reembolsoId: string }, PasarelaError>>
}
```

El dominio de `payments` conoce **esta interfaz y nada más**. No sabe qué es PayPal, ni que
existe un webhook, ni que hay una cola. La implementación
`infrastructure/out/paypal/paypal.gateway.ts` usa el SDK oficial de PayPal para TypeScript.

## 2. Flujo de compra

```
1. Frontend: POST /api/payments/ordenes  { cursoId }        [JWT requerido]
2. payments: lee el precio de SU proyección (doc 03 §9) — NO llama a catalog
3. payments: crea Orden(estado=PENDIENTE, monto congelado, expira en 24 h)
4. payments → PayPal: create order → devuelve { paypalOrderId, urlAprobacion }
5. payments: guarda paypalOrderId · emite payments.orden-creada.v1
6. Frontend: redirige a urlAprobacion (o abre el botón de PayPal)
7. Usuario aprueba en PayPal → PayPal redirige a urlRetorno
8. Frontend: POST /api/payments/ordenes/:id/capturar
9. payments → PayPal: capture → { capturaId, comision, neto }
10. payments: Orden.capturar() → estado=CAPTURADA → emite payments.pago-confirmado.v1
11. EventBridge → sqs-enrollment → matrícula habilitada
12. Frontend: hace polling de GET /api/enrollment/matriculas/:cursoId hasta ACTIVA
    (con un mensaje honesto: "Confirmando tu pago…", no una barra falsa)
```

**El paso 12 es el precio de la consistencia eventual y hay que diseñarlo, no esconderlo.**
Entre la captura y la matrícula pasan cientos de milisegundos, a veces algunos segundos.
El frontend hace polling cada segundo durante 15 s; si no llega, muestra "Tu pago se
confirmó, estamos habilitando tu curso" con un enlace al dashboard — nunca un error, porque
el dinero ya se cobró y el evento está en camino.

**El pago se confirma dos veces y a propósito:** por la captura síncrona (paso 9) y por el
webhook (§3). El que llegue primero gana; el segundo se descarta por idempotencia. Si el
usuario cierra el navegador entre 7 y 8, el webhook completa la compra igual.

## 3. Webhook

Endpoint: `POST /api/payments/webhook`. **Público** (PayPal no manda JWT), autenticado por
firma.

Eventos suscritos:

| Evento de PayPal | Efecto |
|---|---|
| `CHECKOUT.ORDER.APPROVED` | Marca la orden `APROBADA`. Si en 2 min no hubo captura por el flujo síncrono, captura desde el worker |
| `PAYMENT.CAPTURE.COMPLETED` | Confirma la captura → `payments.pago-confirmado.v1` |
| `PAYMENT.CAPTURE.DENIED` | `FALLIDA` → `payments.pago-fallido.v1` |
| `PAYMENT.CAPTURE.REFUNDED` | `REEMBOLSADA` → `payments.pago-reembolsado.v1` → enrollment revoca |

**Verificación de firma — obligatoria, sin atajos.** Se llama a
`POST /v1/notifications/verify-webhook-signature` con los headers `paypal-transmission-id`,
`paypal-transmission-time`, `paypal-transmission-sig`, `paypal-cert-url`, `paypal-auth-algo`,
el `webhook_id` y el **cuerpo crudo**.

> Dos detalles que rompen esto en la práctica:
> 1. **El cuerpo tiene que ser el crudo, byte por byte.** Si Express ya lo parseó a JSON y
>    se re-serializa, la firma **no valida** — el orden de las claves o el espaciado cambian.
>    La ruta del webhook se monta con `express.raw({ type: 'application/json' })` **antes**
>    del `express.json()` global. Es el error más común de esta integración.
> 2. `paypal-cert-url` debe verificarse que apunte a un host de PayPal antes de usarla. Si
>    no, es una SSRF servida en bandeja.

Un webhook con firma inválida se registra en `webhooks_paypal` con `firma_valida = false`,
**no se procesa**, y responde 200 (responder 400 le dice al atacante que su sonda llegó).

## 4. Por qué el webhook pasa por una cola

```
PayPal → POST /webhook
   ├─ verifica firma                        (~100 ms)
   ├─ INSERT webhooks_paypal (crudo)        ← sobrevive a cualquier fallo posterior
   ├─ envía a sqs-payments-webhooks
   └─ responde 200                          ← total < 200 ms
                       ↓
   worker: procesa con reintentos → DLQ si falla 5 veces
                       ↓
   solo si todo salió bien → payments.pago-confirmado.v1 a EventBridge
```

Motivo: **PayPal reintenta si el endpoint tarda o falla**, y esos reintentos son una fuente
clásica de doble cobro o doble matrícula. Responder rápido y procesar aparte, con
reintentos propios y DLQ, convierte un problema de latencia en un problema de cola.

Idempotencia en dos capas (doc 03 §9): `paypal_event_id` contra los reintentos de PayPal,
`processed_events.event_id` contra las reentregas de SQS.

**`payments.pago-confirmado.v1` se emite solo cuando la captura está confirmada por
PayPal** — nunca al recibir el webhook, nunca al aprobar la orden. Emitirlo antes habilita
cursos que no se pagaron.

## 5. Credenciales

Las variables (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`,
`PAYPAL_BUSINESS_EMAIL`, `PAYPAL_ENV`, `MONEDA_DEFAULT`) se le entregan a Fable **en el
mensaje de la sesión**, no en un archivo del repo.

**Primera instrucción de la sesión:** subirlas a Secrets Manager como
`edtech/dev/paypal` y **no volver a escribirlas en texto plano en ningún archivo** — ni en
`DECISIONS.md`, ni en un `.env` versionado, ni en un log.

```
edtech/dev/paypal  →  {"env":"sandbox","clientId":"…","clientSecret":"…",
                       "webhookId":null,          ← lo completa Fable en F8 (§6)
                       "businessEmail":"…","moneda":"USD"}
```

- La task definition de `payments` las inyecta con `valueFrom`, así que el contenedor las
  recibe sin que nadie las escriba.
- El rol de tarea de `payments` es el **único** con `GetSecretValue` sobre ese ARN.
- `.gitignore` incluye `.env`, `.env.*` y `*.tfvars` (salvo `*.example.tfvars`).
- **Verificación obligatoria antes de cerrar (I-12, doc 15):**
  `git log -p | grep -iE "client_secret|AQ[A-Za-z0-9]{20,}"` debe salir vacío. Un secreto
  en el historial de Git sigue ahí aunque se borre el archivo.
- En local, el `.env` **no versionado** apunta a las credenciales sandbox y LocalStack
  emula Secrets Manager, así que el código lee del mismo sitio en los dos entornos.

## 6. El `webhook_id` es configuración por entorno

**No es un prerrequisito de la sesión y no se pide al operador.** Un webhook necesita una
URL pública, y `payments-service` no existe hasta F8: cualquier `WH-…` creado antes apunta
a la nada.

| Entorno | URL del webhook | Quién lo crea | Cuándo |
|---|---|---|---|
| AWS `dev` | `https://<alb>/api/payments/webhook` | Fable, por API | F8 |
| Local | `https://<dominio-estatico>.ngrok-free.app/api/payments/webhook` | El operador, a mano | Solo si va a depurar en local |

Cada entorno tiene su propio `webhookId` en su secreto, igual que tiene su propia
`DATABASE_URL`. El código lee el que le toca; el `PasarelaPagoPort` no sabe que existen dos.

### 6.1 Alta idempotente en F8

Antes de crear, Fable consulta `GET /v1/notifications/webhooks` y **reutiliza** el que ya
apunte a la URL correcta. Crear uno nuevo en cada despliegue agota el límite de webhooks
por app de PayPal y deja duplicados que entregan el mismo evento dos veces.

### 6.2 Por qué el ALB y no ngrok

La URL del ALB de `dev` existe desde **F4-bis** (doc 14) y no cambia. Un túnel gratuito de
ngrok cambia de dominio en cada reinicio, y el `webhook_id` está atado a la URL exacta: en
cuanto rota, PayPal sigue llamando a un dominio muerto y **el pago deja de confirmarse sin
ningún error visible**. Es el fallo más común de esta integración (R16) y acá se elimina de
raíz: `dev` no depende de ngrok.

### 6.3 Local, cuando haga falta

Solo para depurar el handler con un pago real. Con **dominio estático** de ngrok (el plan
gratuito incluye uno reservado), no con el aleatorio:

```bash
ngrok http --url=edtech-hp.ngrok-free.app 3005
```

Se crea **ese** webhook una sola vez, con su propio `WH-…`, y sirve para siempre.

Para los tests automatizados no se usa ngrok en absoluto: el `PasarelaPagoPort` se
reemplaza por un doble con la verificación de firma mockeada. El simulador de webhooks del
dashboard de PayPal no sirve para probar la verificación real —manda eventos cuya firma no
valida contra el `webhook_id` de la app—, así que **la firma se prueba una vez, a mano,
contra un pago sandbox de verdad** en F8.

## 7. Comisiones en Perú

Referencia para el diseño de precios y reportes, **no bloquea el desarrollo**: PayPal cobra
alrededor de **5,4 % + $0,30** por transacción internacional, más IGV en cobros locales, y
si el cobro es en USD y la cuenta liquida en PEN se agrega un spread de conversión de
~3-4 %.

Consecuencias que sí están en el diseño:

- La orden guarda `comision` y `neto` **tal como los devuelve PayPal** al capturar
  (doc 03 §9), no calculados con una fórmula propia que envejece.
- Un curso de $19.90 deja aproximadamente $18.53 antes de conversión. Los reportes del
  admin muestran **bruto, comisión y neto** separados: mostrar solo el bruto es engañarse.
- `MONEDA_DEFAULT` se decide al configurar las credenciales
  (ver `../CREDENCIALES-PAYPAL.md` §5).

## 8. Casos borde que el diseño cubre

| Caso | Qué pasa |
|---|---|
| El usuario cierra el navegador tras aprobar | El webhook `PAYMENT.CAPTURE.COMPLETED` completa la compra igual |
| Doble clic en "Pagar" | La orden `PENDIENTE` existente para (usuario, curso) se reutiliza; no se crea otra |
| El precio cambia entre crear y capturar | Se cobra el monto congelado en la orden. `version_precio` deja el rastro para conciliar |
| Se compra un curso ya comprado | 409 antes de crear la orden, consultando `enrollment` (o la matrícula que payments ya conoce por el evento) |
| La orden queda `PENDIENTE` para siempre | Job que expira a las 24 h |
| Reembolso | Webhook → `pago-reembolsado.v1` → enrollment pone la matrícula en `REVOCADA`. **El progreso no se borra**: si vuelve a comprar, lo recupera |
| PayPal responde 500 al capturar | `Err` de infraestructura → el frontend reintenta; la orden sigue `APROBADA` y el webhook la rescata |
| Curso gratuito ($0) | No pasa por PayPal: `enrollment` crea la matrícula con `origen = GRATUITO`, y payments no se entera |
