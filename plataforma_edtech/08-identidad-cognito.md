# 08 — Identidad: Cognito + `identity-access-service`

> **H2/D2.** La captura pone Cognito; el mega-prompt define un servicio de identidad
> propio. No compiten: **Cognito autentica, el servicio autoriza y guarda el perfil**.

## 1. El reparto, sin ambigüedad

| Responsabilidad                                                 | Dónde vive                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| Registro, login, logout                                         | **Cognito**                                                       |
| Contraseñas, hashing, política de complejidad                   | **Cognito**                                                       |
| Verificación de email, recuperación de contraseña               | **Cognito**                                                       |
| MFA, detección de credenciales comprometidas                    | **Cognito**                                                       |
| Emisión y rotación de tokens (id / access / refresh)            | **Cognito**                                                       |
| Login social (Google)                                           | **Cognito** (federación)                                          |
| Grupos `estudiante` / `docente` / `afiliado`                    | **Cognito** (viaja un solo rol de aplicación en `cognito:groups`) |
| Perfil: nombre visible, avatar, país, idioma                    | `identity-access-service`                                         |
| Nivel A-N vigente y su origen                                   | `identity-access-service`                                         |
| Preferencias (notificaciones, zona horaria)                     | `identity-access-service`                                         |
| Decisiones de autorización de negocio ("¿puede ver este tomo?") | **el servicio dueño del recurso** (enrollment), no identity       |

La última línea importa: `identity-access-service` **no** es un servicio de autorización
centralizado al que todos preguntan. Eso sería un punto único de fallo en el camino
caliente. Cada servicio decide con lo que tiene: el JWT (identidad + rol) más su propio
estado (¿tiene matrícula activa?).

## 2. User Pool

```hcl
resource "aws_cognito_user_pool" "principal" {
  name = "edtech-dev-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 10
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false          # exigir símbolos empuja a la gente a Password1! y a un post-it
  }

  account_recovery_setting {
    recovery_mechanism { name = "verified_email", priority = 1 }
  }

  schema {
    name                = "nombre_visible"
    attribute_data_type = "String"
    mutable             = true
  }

  lambda_config {
    post_confirmation = aws_lambda_function.post_confirmation.arn
    pre_token_generation_config {
      lambda_arn     = aws_lambda_function.pre_token.arn
      lambda_version = "V2_0"
    }
  }

  user_pool_tier    = "ESSENTIALS"
  mfa_configuration = "OPTIONAL"       # TOTP disponible; obligatorio para docente (§6)
}

resource "aws_cognito_user_group" "estudiante" { name = "estudiante", user_pool_id = ... , precedence = 10 }
resource "aws_cognito_user_group" "docente"    { name = "docente",    user_pool_id = ... , precedence = 1 }
resource "aws_cognito_user_group" "afiliado"   { name = "afiliado",   user_pool_id = ... , precedence = 5 }
```

**App client** para la web: público (sin secret), flujo **Authorization Code + PKCE**, con
`callback_urls` de `http://localhost:3000/api/auth/callback` (dev local) y del dominio de
CloudFront. **No** se habilita el flujo implícito ni `USER_PASSWORD_AUTH`.

Vigencias: `access` 1 h · `id` 1 h · `refresh` 30 días, con rotación de refresh token.

## 3. El JWT que ven los servicios

Se valida el **access token** (no el id token) para llamadas de API:

```json
{
  "sub": "8f2c9d10-...",
  "token_use": "access",
  "scope": "openid profile email",
  "cognito:groups": ["estudiante"],
  "client_id": "3k9…",
  "iss": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_AbCdEf",
  "exp": 1787000000
}
```

El `sub` **es** el `usuarios.id` de `identity` (doc 03 §4) y el `usuarioId` de todos los
demás schemas. Una sola identidad en todo el sistema, sin tabla de mapeo.

`cognito:groups` llega en el access token de Cognito, así que el rol no requiere una
consulta a `identity-access-service` en cada request. El registro fija un atributo
inmutable `custom:rol_aplicacion`; la Lambda post-confirmation agrega las cuentas públicas
de estudiante o afiliado a su grupo. El grupo docente requiere aprovisionamiento operativo;
el registro público no puede asignarlo. Durante la migración, el grupo legado `admin` se
normaliza a `docente`; `pre_token_generation` conserva un solo rol y emite únicamente el
grupo moderno. El aprovisionamiento operativo quita `admin` y deja un solo grupo moderno.

## 4. Sincronización Cognito → `identity-access-service`

Lambda **post-confirmation**: se dispara cuando el usuario confirma su email.

```
Cognito (confirmación) → Lambda post-confirmation
   → agrega al grupo estudiante/afiliado del registro público
   → conserva el grupo docente solo si la cuenta fue aprovisionada por operación (sin otros grupos de rol)
   → identity-access crea el usuario con id = sub, rol elegido, nivel A
   → publica identity.usuario-registrado.v1
   → gamification crea perfil solo para estudiantes
```

Tres puntos que hay que resolver bien y suelen hacerse mal:

1. **La Lambda no puede fallar el registro.** Si `identity-access` está caído, la Lambda
   **no** lanza excepción (eso bloquearía la confirmación del usuario): encola el alta en
   `sqs-identity` y devuelve OK. El usuario queda registrado en Cognito y su fila aparece
   segundos después.
2. **Reconciliación.** Un job diario compara los usuarios de Cognito
   (`ListUsers`) con las filas de `identity.usuarios` y crea las que falten. Cubre el caso
   de que se pierda la Lambda y el mensaje.
3. **Alta perezosa como última red.** Si un servicio recibe un JWT válido cuyo `sub` no
   existe en `identity.usuarios`, el middleware dispara el alta y sigue. Un JWT firmado por
   Cognito es prueba suficiente de que el usuario existe.

## 5. Validación del JWT en cada servicio

Middleware compartido en `@edtech/shared-kernel/src/http/auth.middleware.ts`. Verifica:

1. Firma contra el **JWKS** de Cognito (`/.well-known/jwks.json`), **cacheado en memoria**
   con TTL de 1 hora. Sin caché serían dos llamadas HTTP por request.
2. `iss` = el User Pool esperado · `token_use` = `"access"` · `client_id` = el esperado.
3. `exp` con tolerancia de reloj de 60 s.

Y deja en el contexto de la request: `{ usuarioId: sub, roles: cognito:groups, correlationId }`.

```ts
export const requiereAuth = (): Middleware => async (req, res, next) => { /* ... */ }
export const requiereRol = (rol: 'docente' | 'estudiante' | 'afiliado'): Middleware => /* ... */
```

> **Ojo con `token_use`.** Es el error clásico: aceptar el _id token_ porque trae el email
> y es cómodo. El id token está pensado para el cliente, no para autorizar APIs. Se valida
> `token_use === "access"` explícitamente, y hay un test que envía un id token válido y
> exige un 401.

Rutas públicas sin JWT: `GET /api/catalog/cursos*` (el catálogo se ve sin cuenta),
`POST /api/payments/webhook` (autenticado por firma de PayPal, doc 09 §3), `/health`,
`/ready`.

## 6. Docente: gestión de la plataforma

- El rol `docente` concentra la administración global: cursos, rutas, evaluaciones,
  flashcards, estudiantes, métricas, afiliados y pagos.
- El grupo `docente` **no se asigna por API ni por registro público**. Se asigna mediante
  aprovisionamiento operativo en Cognito. Ningún endpoint de perfil acepta cambiar `rol`.
- **MFA (TOTP) obligatorio para docentes.** Cognito no permite exigir MFA por grupo
  de forma nativa. La Lambda `pre_token_generation` V2_0 agrega `mfa_pendiente: "true"`
  a los tokens ID y access si el usuario está en `docente` y aún no tiene TOTP. La UI
  lo guía a configurar MFA; las Route Handlers web y el middleware de servicios bloquean
  las APIs docentes con MFA pendiente. Tras confirmar TOTP, el servidor renueva los tokens
  y actualiza la sesión.
  V2_0 requiere el plan Cognito Essentials o Plus; el pool destino declara Essentials.
- La configuración MFA se valida con el flujo Cognito real al reactivar AWS; la validación
  local de código no prueba el comportamiento del trigger ni la rotación del refresh token.
- Las rutas `/api/*/admin/*` comprueban rol docente y MFA en el servidor; cada servicio
  vuelve a validar `requiereRol('docente')` y `MFA_REQUERIDO`. Ocultar un botón en el
  frontend no es autorización.

## 7. Roles de aplicación

- El registro público permite `estudiante` y `afiliado`; el grupo `docente` se asigna por
  aprovisionamiento operativo.
- Cada cuenta tiene un solo grupo entre `estudiante`, `docente` y `afiliado`.
- Cognito conserva `custom:rol_aplicacion` como atributo inmutable; la Lambda no concede el
  grupo docente a partir de ese atributo.
- El header, las páginas privadas y las APIs se filtran por ese grupo.
- Una cuenta no combina estudiante, docente y afiliado; para otro rol se usa otro correo.
- No existe un grupo o rol de aplicación `admin`; la capacidad de gestión pertenece a `docente`.

## 8. Frontend (Next.js)

- El login usa el **Hosted UI** de Cognito con PKCE. No se escribe un formulario de login
  propio en Fase 1: ahorra el manejo de errores de credenciales, verificación y
  recuperación, que es más código del que parece.
- Los tokens se guardan en **cookies httpOnly + Secure + SameSite=Lax**, escritas por un
  Route Handler de Next (`/api/auth/callback`). **No en `localStorage`**: cualquier XSS se
  llevaría el token.
- El refresh lo hace un Route Handler del servidor, no el navegador.
- Los Server Components leen la cookie y llaman a las APIs con el `Authorization: Bearer`.
  El navegador nunca ve el access token.

## 9. Local (LocalStack)

LocalStack Community **no** implementa Cognito. Dos alternativas evaluadas:

| Opción               | Veredicto                                     |
| -------------------- | --------------------------------------------- |
| LocalStack Pro       | Descartado: licencia de pago para una función |
| **Emisor JWT local** | **Elegido**                                   |

En `docker compose` corre un contenedor mínimo que emite JWT con la **misma forma** que
Cognito (`sub`, `token_use: "access"`, `cognito:groups`, `iss` local) y expone su propio
`/.well-known/jwks.json`. El middleware del kernel apunta al issuer que le diga
`COGNITO_ISSUER`, así que **el código de validación es exactamente el mismo** en local y en
AWS — que es justamente lo que hace que la prueba local valga algo.

Riesgo asumido y anotado (**R15**, doc 15): el emisor local no reproduce el
comportamiento de Cognito en federación social, MFA ni rotación de refresh. Esos tres
caminos se prueban **solo** contra AWS `dev`, y así queda escrito en el guion de aceptación
(doc 14, F12).
