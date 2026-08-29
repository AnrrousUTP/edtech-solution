# Decisiones de `gamification`

Los supuestos globales (D1–D20 y A-01…) están en el [`DECISIONS.md` de la
raíz](../../DECISIONS.md). Acá va solo lo propio de este servicio: qué decide,
qué no, y por qué está hecho así.

## Qué posee

- El esquema `gamification`: puntos, racha, insignias y certificados.
- Los PDF de certificado en S3 bajo `certificados/`.

## Qué NO posee

- El progreso: se entera por eventos de `enrollment-progress` y no lo consulta.
- El nombre real del estudiante — hoy congela el `usuarioId` (A-27, deuda inmediata).

## Decisiones propias

- **I-7 (una insignia se otorga una sola vez) se garantiza con un UNIQUE en la base**, no
  con un `if` en el handler: un reintento de SQS con el mismo evento no puede duplicarla.
  Verificado en F6 y otra vez en el E2E de F9/F10.
- **El PDF se escribe a mano** (A-28): un navegador headless son cientos de MB en la imagen
  y una librería de layout es de más para una página de texto. Se normaliza a Latin-1
  porque `WinAnsiEncoding` no cubre más, y un certificado con tildes rotas es peor que uno
  sin tildes.
- **El código de verificación es `EDT-XXXX-XXXX` sin caracteres ambiguos** (A-29): se dicta
  por teléfono y se transcribe desde un papel.

## Lecturas y escrituras hacia afuera

- Consume `identity.usuario-registrado.v1` y los cinco eventos de progreso de
  `enrollment-progress`.
- Emite `insignia-otorgada`, `certificado-emitido` y `racha-actualizada`.
- Cola interna propia (`gamification-certificados`) para el worker de PDF: generar un PDF
  no puede bloquear el procesamiento del evento que lo disparó.
