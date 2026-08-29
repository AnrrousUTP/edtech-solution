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

- **El grupo `admin` no se asigna por API.** Se pone a mano en Cognito (doc 08 §6). La
  escalada de privilegios más común es un endpoint de "actualizar mi perfil" que acepta el
  campo `rol`; acá ese endpoint no existe.
- **El MFA de admin lo fuerza `pre_token_generation`**, no una regla nativa de Cognito
  (que no la tiene por grupo): si el usuario está en `admin` y no configuró TOTP, el **id
  token** sale con `mfa_pendiente: "true"` y el frontend lo manda a configurarlo.
  Verificado contra Cognito real en F12: aparece sin MFA y desaparece con MFA activo.
  Es un bloqueo de UI, no una barrera criptográfica — la barrera real es que el grupo se
  asigna a mano y que las rutas de admin lo exigen en el servidor.
- **`COGNITO_CLIENT_ID` admite una lista** separada por comas (A-44): el pool de dev tiene
  el cliente web y el de pruebas, y apagar la comprobación era peor que ampliarla.

## Lecturas y escrituras hacia afuera

- Consume `enrollment.curso-completado.v1` y `enrollment.test-nivelacion-completado.v1`
  para mantener el nivel del estudiante. Nada más.
- Emite `identity.usuario-registrado.v1` y `identity.perfil-actualizado.v1`.
