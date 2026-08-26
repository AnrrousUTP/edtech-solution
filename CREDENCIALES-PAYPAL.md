# Cómo obtener las credenciales de PayPal sandbox

Son seis variables, pero **solo cuatro las consigues tú ahora**: `PAYPAL_WEBHOOK_ID` se
crea solo más adelante (paso 4) y `PAYPAL_ENV` ya está fijo en `sandbox`. Todo se hace en
**https://developer.paypal.com**, gratis y sin cuenta empresarial: sandbox es un entorno de
prueba con dinero ficticio.

Tiempo estimado: **10 minutos.** No necesitas tener nada corriendo, ni ngrok, ni el
proyecto empezado.

---

## 1. Entrar al dashboard de desarrollador

1. Ve a **https://developer.paypal.com** e inicia sesión con tu cuenta de PayPal
   (sirve una personal; no hace falta la empresarial todavía).
2. Arriba a la derecha, entra a **Dashboard**.
3. Verifica que el conmutador **Sandbox / Live** esté en **Sandbox**. Todo lo que sigue
   es en Sandbox.

---

## 2. Cuentas de prueba → `PAYPAL_BUSINESS_EMAIL`

En el menú lateral: **Testing Tools → Sandbox Accounts**.

PayPal crea dos cuentas automáticamente:

| Tipo | Para qué |
|---|---|
| **Business** | Es tu "tienda": recibe los pagos |
| **Personal** | Es el comprador con el que vas a probar |

1. Copia el email de la cuenta **Business** (algo como
   `sb-abc123456789@business.example.com`).
   → Ese es **`PAYPAL_BUSINESS_EMAIL`**.
2. Abre la cuenta **Personal** con el botón `⋮ → View/Edit account` y anota su email y su
   **System-Generated Password**. Con esa cuenta te vas a loguear al pagar en las pruebas.
   No es una variable del sistema, pero la vas a necesitar todo el tiempo.

> Si no aparece ninguna cuenta, créalas con **Create account**: una `Business` y una
> `Personal`, país cualquiera (US va bien para sandbox), saldo por defecto.

---

## 3. Crear la App REST → `PAYPAL_CLIENT_ID` y `PAYPAL_CLIENT_SECRET`

En el menú lateral: **Apps & Credentials**. Con el conmutador en **Sandbox**.

1. Botón **Create App**.
2. **App Name:** `edtech-solution-dev`.
3. **App Type:** `Merchant`.
4. **Sandbox Business Account:** elige la cuenta Business del paso 2.
5. **Create App**.

Ya en la pantalla de la app:

- **Client ID** está a la vista → **`PAYPAL_CLIENT_ID`**.
- **Secret Key** está oculto: haz clic en **Show** (o en el icono del ojo) junto a
  `Secret key 1` → **`PAYPAL_CLIENT_SECRET`**.

> El secret se puede volver a ver siempre que quieras desde esta misma pantalla; no es de
> un solo uso. Si alguna vez se filtra, el botón **Generate new secret** lo rota y el
> anterior deja de funcionar.

Más abajo, en **Features**, deja marcado **Accept payments**. Es lo único que hace falta.

---

## 4. El webhook → `PAYPAL_WEBHOOK_ID` (déjalo VACÍO)

> **Lee esto antes de intentar crearlo.** Este es el único de los seis valores que **no**
> puedes conseguir todavía, y no pasa nada: el plan está hecho para que se resuelva solo.

### 4.1 Por qué no se puede ahora

Un webhook es una URL a la que PayPal llama cuando un pago se completa. Para crearlo hace
falta esa URL pública, y hoy **no existe**:

- `payments-service` se construye en la fase **F8** del plan (doc 14), después de la
  infraestructura y de otros cuatro servicios. Hoy no hay nada escuchando en el puerto 3005.
- Aunque levantes `ngrok http 3005` sin nada detrás (el túnel se abre igual y devuelve 502),
  el dominio gratuito de ngrok **cambia cada vez que lo reinicias**. El `WH-…` que crearas
  hoy apuntaría a una URL muerta mucho antes de llegar a F8.

Crear el webhook ahora es trabajo que se tira.

### 4.2 Qué hacer en su lugar

**Deja `PAYPAL_WEBHOOK_ID` vacío en el bloque del paso 6.** Con el `CLIENT_ID` y el
`CLIENT_SECRET` —que sí tienes— Fable crea el webhook por API cuando llega a F8, contra la
URL del ALB de AWS `dev`, que para entonces ya existe y es **estable**:

```
POST https://api-m.sandbox.paypal.com/v1/notifications/webhooks
{
  "url": "https://<alb-de-dev>/api/payments/webhook",
  "event_types": [
    {"name": "CHECKOUT.ORDER.APPROVED"},
    {"name": "PAYMENT.CAPTURE.COMPLETED"},
    {"name": "PAYMENT.CAPTURE.DENIED"},
    {"name": "PAYMENT.CAPTURE.REFUNDED"}
  ]
}
```

La respuesta trae el `id` (`WH-…`), y Fable lo guarda en Secrets Manager junto al resto.
**Tú no tienes que hacer nada.**

Esto además arregla la causa raíz: el webhook de `dev` deja de depender de ngrok. La URL
del ALB no rota, así que el `WEBHOOK_ID` no caduca nunca.

### 4.3 Y para probar en tu máquina

El `webhook_id` es **configuración por entorno**, igual que la URL de la base de datos.
PayPal permite varios webhooks en la misma app, así que al final hay dos:

| Entorno | URL | Quién lo crea |
|---|---|---|
| AWS `dev` | `https://<alb>/api/payments/webhook` | Fable, en F8, por API |
| Local | `https://<tu-dominio>.ngrok-free.app/api/payments/webhook` | Tú, cuando quieras depurar en local |

Cada uno tiene su propio `WH-…`, y el código lee el que corresponda. No se pisan.

**Cuando llegues a querer probar en local** (no antes), hazlo con un **dominio estático de
ngrok**, no con el aleatorio. El plan gratuito de ngrok incluye un dominio reservado:

1. En **https://dashboard.ngrok.com** → *Domains* → **New Domain**. Te queda algo como
   `edtech-hp.ngrok-free.app`.
2. Levántalo siempre así:
   ```bash
   ngrok http --url=edtech-hp.ngrok-free.app 3005
   ```
3. Crea **ese** webhook con esa URL fija, una sola vez, y su `WH-…` te sirve para siempre.

Con dominio estático desaparece el problema clásico de "el webhook dejó de llegar y nadie
sabe por qué". Sin dominio estático, cada reinicio de ngrok te obliga a editar la URL del
webhook a mano.

> **Si por algún motivo prefieres crearlo a mano en el dashboard**, la ruta es
> **Apps & Credentials → edtech-solution-dev → Sandbox Webhooks → Add Webhook**, con los
> cuatro `event_types` de arriba. El `Webhook ID` aparece bajo la URL en la lista. Pero
> repito: para el arranque **no hace falta**.

---

## 5. Elegir `MONEDA_DEFAULT`

| Opción | Cuándo conviene | Qué implica |
|---|---|---|
| **`USD`** (recomendado) | Cursos vendidos a cualquier país | Comisión internacional de PayPal ≈ **5,4 % + $0,30**. Si tu cuenta liquida en soles, se suma un spread de conversión de ~3-4 % |
| **`PEN`** | Solo vendes en Perú | Evitas el spread de conversión, pero PayPal cobra IGV sobre la comisión en cobros locales y limitas la venta al exterior |

Para un catálogo de cursos en línea, **`USD`** es lo habitual. En sandbox da igual: puedes
cambiarlo después sin rehacer nada.

---

## 6. Bloque para pegar

Copia esto, complétalo y pégalo en la sección **9.1** del prompt de Fable
(`plataforma_edtech/17-prompt-para-fable.md`):

```
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=          # DÉJALO VACÍO — Fable lo crea en F8 (paso 4)
PAYPAL_BUSINESS_EMAIL=
MONEDA_DEFAULT=USD
```

`PAYPAL_WEBHOOK_ID` vacío es **lo correcto**, no un olvido. Es el único campo que Fable
tiene permitido resolver por su cuenta; los otros cuatro sí deben ir completos o la sesión
se detiene a pedírtelos.

Y para tus pruebas manuales, ten a mano (no son variables del sistema):

```
Comprador sandbox (email):
Comprador sandbox (password):
Dominio estático de ngrok (solo si vas a depurar en local):
```

---

## 7. Seguridad — léelo antes de guardar nada

1. **No versiones este archivo con los valores dentro.** Agrégalo a `.gitignore` o
   guárdalo fuera de cualquier repositorio.
2. **No pegues las credenciales en ningún `.md` del plan**, ni en `DECISIONS.md`, ni en un
   comentario del código, ni en un mensaje de chat que quede guardado.
3. La **primera instrucción** que tiene Fable es subir estos valores a **AWS Secrets
   Manager** (`edtech/dev/paypal`) y no volver a escribirlos en texto plano en ningún
   archivo. A partir de ahí, el código los lee de ahí.
4. Estas son credenciales de **sandbox**: no mueven dinero real. Aun así, trátalas como
   secretos — el mismo descuido que las filtra hoy filtra las de producción mañana.
5. Si alguna vez terminan en un commit: **rotar el secret** en el dashboard
   (**Generate new secret**). Borrar el archivo no basta; el historial de Git lo conserva.
6. Las credenciales **live** (producción) se sacan igual, pero con el conmutador en
   **Live** y con una cuenta empresarial verificada. **No las mezcles con estas**, y no las
   pongas en `dev`.
