# identity-access-service — catálogo de eventos

## Publica (al bus `edtech-domain-events`)

| Evento                           | Payload                                        | Cuándo                                                 |
| -------------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `identity.usuario-registrado.v1` | `usuarioId, email, nombreVisible, rol`         | Alta desde Cognito (post-confirmation o alta perezosa) |
| `identity.nivel-actualizado.v1`  | `usuarioId, nivelAnterior, nivelNuevo, origen` | El nivel sube (regla de no-castigo: nunca baja)        |
| `identity.perfil-actualizado.v1` | `usuarioId, campos[]`                          | El usuario edita su perfil                             |

## Consume (cola `edtech-dev-identity`)

| Evento                                                            | Efecto                                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `enrollment.curso-completado.v1`                                  | `nivel = max(nivel, nivelMax del curso)` — usa el campo opcional `nivelMax` (A-11) |
| `enrollment.test-nivelacion-completado.v1`                        | Fija el nivel con origen `TEST`                                                    |
| `identity.alta-usuario-cognito.v1` (interno, no viaja por el bus) | Alta del usuario; lo encola la Lambda post-confirmation (A-12)                     |

Idempotencia: `identity.processed_events` (D13).
