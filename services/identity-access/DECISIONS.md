# Decisiones de `identity-access`

Los supuestos globales (D1–D20 y A-01…) están en el [`DECISIONS.md` de la
raíz](../../DECISIONS.md). Acá va solo lo propio de este servicio: qué decide,
qué no, y por qué está hecho así.

## Qué posee

- El esquema `identity`: perfiles, roles y el nivel alcanzado por cada estudiante.
- Las dos Lambdas de Cognito (`post_confirmation` y `pre_token_generation`), porque son
  parte de la identidad y de nadie más.

## Qué NO posee

- **Contraseñas, MFA, refresh y federación social: son de Cognito** (D2). Este servicio
  nunca ve una contraseña ni emite un token.
- La autorización de las rutas de otros servicios: cada uno valida su propio token con el
  middleware del kernel.

## Decisiones propias

- **El grupo `docente` no se asigna por API ni por registro público.** Se aprovisiona en
  Cognito por operación; así se evita la escalada de permisos desde el campo `rol` del cliente.
- **El grupo legado `admin` equivale a `docente` durante la migración.** La Lambda pre-token
  lo normaliza para conservar el acceso de gestión; el aprovisionamiento operativo elimina
  `admin`, deja un único grupo moderno y conserva grupos Cognito ajenos a la aplicación.
- **Una cuenta tiene un solo rol de aplicación.** El registro público crea `estudiante` o
  `afiliado`; las cuentas `docente` se aprovisionan aparte. Un usuario que necesite otro rol
  usa otra cuenta con otro correo.
- **El MFA de docente lo fuerza `pre_token_generation` V2_0**, no una regla nativa de Cognito
  (que no la tiene por grupo): si el usuario está en `docente` y no configuró TOTP, los tokens
  ID y access salen con `mfa_pendiente: "true"`. La UI guía el alta y el middleware del kernel
  bloquea las APIs docentes con `MFA_REQUERIDO`. Tras verificar TOTP, el Route Handler renueva
  los tokens para que la sesión firmada refleje el MFA activo. Cognito queda en plan Essentials,
  necesario para personalizar el access token con V2_0; validar el flujo contra AWS al reactivar.
- **`COGNITO_CLIENT_ID` admite una lista** separada por comas (A-44): el pool de dev tiene
  el cliente web y el de pruebas, y apagar la comprobación era peor que ampliarla.

## Lecturas y escrituras hacia afuera

- Consume `enrollment.curso-completado.v1` y `enrollment.test-nivelacion-completado.v1`
  para mantener el nivel del estudiante. Nada más.
- Emite `identity.usuario-registrado.v1` y `identity.perfil-actualizado.v1`.
