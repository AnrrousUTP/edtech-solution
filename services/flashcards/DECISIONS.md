# Decisiones de `flashcards`

Los supuestos globales (D1–D20 y A-01…) están en el [`DECISIONS.md` de la
raíz](../../DECISIONS.md). Acá va solo lo propio de este servicio: qué decide,
qué no, y por qué está hecho así.

## Qué posee

- El esquema `flashcards`: mazos, tarjetas, estados de revisión y el hash del contenido
  que las originó.

## Qué NO posee

- El contenido de las lecciones: lo lee de S3 por la **clave** que trae el evento
  (doc 02 §7.3). Nunca toca el esquema de `catalog`.
- La decisión de qué tarjeta ve el estudiante: eso lo decide un humano (HITL).

## Decisiones propias

- **I-8 vive en el repositorio.** `porTomoParaEstudiante()` filtra
  `estado = 'PUBLICADA'` en el SQL: un endpoint nuevo que se olvide del filtro no puede
  exponer tarjetas sin revisar porque no tiene forma de pedirlas. Sin excepción, sin
  bypass de admin "para probar rápido", sin flag de entorno.
- **Caché por hash de contenido**: `UNIQUE (tomo_id, contenido_hash)`. Un evento por una
  tilde corregida no invoca al modelo. Verificado en F7 y en el E2E.
- **Un fallo con intentos disponibles devuelve `Ok` y deja el mazo en `GENERANDO`**
  (A-32), para que SQS reintente por su cuenta: contar reintentos por dos vías haría que
  el mensaje llegara a la DLQ antes de agotar los 3 intentos de negocio.
- **`modelo_usado` se registra desde la configuración**, no desde la respuesta (A-33): el
  Agent Runtime no devuelve el model ID, y el valor autoritativo es el que Terraform
  resolvió por CLI (D8).
- Hoy `dev` corre con el generador **fake**: la cuenta no tiene acceso a ningún modelo de
  Bedrock (A-46). Pasar a `bedrock` es un `terraform apply`, no un cambio de código.

## Lecturas y escrituras hacia afuera

- Consume `catalog.contenido-actualizado.v1`. Nada más.
- Emite `mazo-generado`, `tarjeta-aprobada`, `tarjeta-rechazada` y `generacion-fallida`.
- **Nunca escribe en `catalog`**: es lo que hace estructuralmente imposible el bucle
  evento → generación → evento (doc 10 §7.1).
