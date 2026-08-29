# enrollment-progress-service — catálogo de eventos

Absorbe **Assessment** (D3): el intento de evaluación y el avance que provoca
son la misma transacción de negocio.

## Publica (al bus `edtech-domain-events`)

| Evento                                     | Payload                                                                 | Cuándo                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `enrollment.matricula-creada.v1`           | `matriculaId, usuarioId, cursoId, origen, ordenId?`                     | Pago confirmado, alta manual o curso gratuito                      |
| `enrollment.leccion-completada.v1`         | `matriculaId, usuarioId, cursoId, tomoId, leccionId, completadaAt`      | El estudiante completa una lección (idempotente)                   |
| `enrollment.tomo-completado.v1`            | `matriculaId, usuarioId, cursoId, tomoId, puntaje`                      | Todas las lecciones hechas + evaluación aprobada                   |
| `enrollment.curso-completado.v1`           | `matriculaId, usuarioId, cursoId, cursoTitulo, completadoAt, nivelMax?` | Todos los tomos completados (`nivelMax` opcional: A-11)            |
| `enrollment.carrera-completada.v1`         | `usuarioId, carreraId, carreraTitulo`                                   | Todos los cursos de una carrera completados (composición vía A-24) |
| `enrollment.evaluacion-aprobada.v1`        | `usuarioId, intentoId, tomoId, puntaje, perfecto`                       | Evaluación de tomo ≥ umbral                                        |
| `enrollment.evaluacion-reprobada.v1`       | `usuarioId, intentoId, tomoId, puntaje`                                 | Evaluación de tomo < umbral                                        |
| `enrollment.test-nivelacion-completado.v1` | `usuarioId, intentoId, nivelResultante, puntaje`                        | Test de nivelación entregado (algoritmo doc 02 §2)                 |

## Consume (cola `edtech-dev-enrollment`)

| Evento                             | Efecto                                              |
| ---------------------------------- | --------------------------------------------------- |
| `payments.pago-confirmado.v1`      | Habilita la matrícula (idempotente, I-2)            |
| `payments.pago-reembolsado.v1`     | Revoca la matrícula                                 |
| `catalog.curso-publicado.v1`       | Alimenta `cursos_proyeccion` (D14)                  |
| `catalog.curso-despublicado.v1`    | Marca `publicado=false` (no revoca acceso comprado) |
| `catalog.contenido-actualizado.v1` | Refresca las lecciones del tomo en la proyección    |

## Lecturas síncronas documentadas

- `GET catalog /interno/bancos/:id/respuestas` (A-19): corrección de intentos.
- `GET catalog /carreras` (A-24): composición de carreras al completar un curso.

Ambas con timeout 2s y degradación. Idempotencia: `enrollment.processed_events` (D13).
