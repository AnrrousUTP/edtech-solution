# gamification-service — catálogo de eventos

## Publica (al bus `edtech-domain-events`)

| Evento                                | Payload                                                                    | Cuándo                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `gamification.insignia-otorgada.v1`   | `usuarioId, criterio, referenciaId, otorgadaAt`                            | Se otorga una insignia (I-7: una sola vez por usuario+criterio+referencia) |
| `gamification.certificado-emitido.v1` | `certificadoId, usuarioId, tipo, referenciaId, titulo, codigoVerificacion` | Curso completado (MENOR) o carrera completada (MAYOR)                      |
| `gamification.racha-extendida.v1`     | `usuarioId, rachaActual`                                                   | La racha crece un día                                                      |
| `gamification.racha-rota.v1`          | `usuarioId, rachaPerdida`                                                  | Pasan más de 48 h sin actividad                                            |

## Consume (cola `edtech-dev-gamification`)

| Evento                              | Efecto                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `enrollment.curso-completado.v1`    | Insignia `CURSO_COMPLETADO` (+`PRIMER_CURSO` si es el primero) y certificado MENOR |
| `enrollment.carrera-completada.v1`  | Insignia `CARRERA_COMPLETADA` y certificado MAYOR                                  |
| `enrollment.leccion-completada.v1`  | Racha + 10 puntos                                                                  |
| `enrollment.tomo-completado.v1`     | 30 puntos                                                                          |
| `enrollment.evaluacion-aprobada.v1` | Insignia `EVALUACION_PERFECTA` solo si `perfecto = true`                           |
| `identity.usuario-registrado.v1`    | Crea el perfil de gamificación                                                     |

## Cola interna

`edtech-dev-gamification-certificados` — el worker genera el PDF del
certificado (tarda segundos) y lo sube a S3. Idempotente: si el certificado ya
tiene `pdf_s3_key`, no se regenera.

Idempotencia: `gamification.processed_events` (D13) + PK de insignias (I-7).
