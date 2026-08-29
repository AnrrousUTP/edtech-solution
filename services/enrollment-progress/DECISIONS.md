# Decisiones de `enrollment-progress`

Los supuestos globales (D1–D20 y A-01…) están en el [`DECISIONS.md` de la
raíz](../../DECISIONS.md). Acá va solo lo propio de este servicio: qué decide,
qué no, y por qué está hecho así.

## Qué posee

- El esquema `enrollment`: matrículas, progreso por lección y tomo, intentos y resultados.
- La regla de qué está desbloqueado y qué no.

## Qué NO posee

- El contenido ni las respuestas correctas: los pide a `catalog`.
- El cobro: se entera de que se pagó por `payments.pago-confirmado.v1`.

## Decisiones propias

- **Assessment está absorbido acá** (I-2 verificado en F5): separar "rendir una evaluación"
  de "avanzar en el curso" habría obligado a una transacción distribuida para algo que
  siempre ocurre junto.
- **Tres lecturas síncronas a `catalog`** (A-19, A-24), no eventos: son lectura, no ocurren
  en cada página y **degradan** — si catalog no responde, el curso se completa igual y la
  carrera se evalúa en el próximo cierre. Hay un test que simula catalog caído.
- **`curso_completado_at` es lo que hace idempotente** la emisión de `curso-completado`
  (A-25): sin él, recompletar una lección lo reemitiría.
- La proyección local `cursos_proyeccion` guarda `precio` y `nivel_max` para no preguntar
  por cada matrícula. Sigue siendo proyección: la fuente de verdad es `catalog`.

## Lecturas y escrituras hacia afuera

- Consume de `payments` (pago confirmado y reembolsado) y de `catalog` (curso publicado,
  despublicado y contenido actualizado).
- Emite `leccion-completada`, `tomo-completado`, `curso-completado`, `carrera-completada`,
  `evaluacion-aprobada` y `test-nivelacion-completado`.
