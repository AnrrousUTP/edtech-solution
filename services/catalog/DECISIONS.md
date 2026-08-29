# Decisiones de `catalog`

Los supuestos globales (D1–D20 y A-01…) están en el [`DECISIONS.md` de la
raíz](../../DECISIONS.md). Acá va solo lo propio de este servicio: qué decide,
qué no, y por qué está hecho así.

## Qué posee

- El esquema `catalog`: carreras, cursos, tomos, lecciones, bancos de preguntas y las
  **respuestas correctas**.
- El contenido de las lecciones en S3 bajo `contenido/`.

## Qué NO posee

- El progreso del estudiante, la matrícula y las evaluaciones rendidas: son de
  `enrollment-progress`.
- El precio cobrado: catalog dice cuánto vale un curso; `payments` decide si se cobró.

## Decisiones propias

- **I-5 vive en el modelo de lectura, no en el controlador.** Las respuestas correctas
  salen únicamente por `GET /interno/bancos/:id/respuestas`, detrás del token de servicio;
  ninguna proyección pública las incluye. Un endpoint nuevo que se olvide del filtro no
  puede filtrarlas porque no tiene forma de pedirlas.
- **El contenido va a S3, no a la base.** El evento `contenido-actualizado` transporta la
  **clave**, nunca el texto (doc 02 §7.3): así el evento no crece con el contenido y
  `flashcards` lee de la misma fuente sin tocar este esquema.
- **`contenido_hash`** (sha256 de los bloques) se calcula acá y viaja en el evento: es lo
  que le permite a `flashcards` no regenerar un mazo por una tilde corregida.

## Lecturas y escrituras hacia afuera

- No consume ningún evento: es la fuente del contenido.
- Emite `curso-publicado`, `curso-despublicado`, `precio-actualizado` y
  `contenido-actualizado`.
- Recibe **tres lecturas síncronas** documentadas desde `enrollment-progress`
  (A-19, A-24): corrección de intentos, umbral del tomo y composición de carreras.
