# flashcards-service — catálogo de eventos

## Publica (al bus `edtech-domain-events`)

| Evento                             | Payload                                                           | Cuándo                                                              |
| ---------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| `flashcards.mazo-generado.v1`      | `mazoId, tomoId, cursoId, version, cantidadTarjetas, modeloUsado` | El generador devolvió tarjetas válidas; el mazo queda `EN_REVISION` |
| `flashcards.mazo-publicado.v1`     | `mazoId, tomoId, cursoId, version, cantidadPublicadas`            | El admin aprueba la primera tarjeta del mazo                        |
| `flashcards.generacion-fallida.v1` | `tomoId, motivo, intentos`                                        | Tres intentos fallidos (doc 10 §7)                                  |

## Consume (cola `edtech-dev-flashcards`)

| Evento                             | Efecto                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `catalog.contenido-actualizado.v1` | Evalúa la caché por `(tomoId, contenidoHash)`. Si el hash es nuevo, crea el mazo versión N+1 en `GENERANDO` y lo encola |

## Cola interna

`edtech-dev-flashcards-generacion` — el worker invoca al generador (30-90 s con
Bedrock) y crea las tarjetas en `PENDIENTE_REVISION`. Dos colas y no una porque
los tiempos son incompatibles (doc 10 §1).

## Invariantes

- **I-8 (HITL)**: el filtro `estado = 'PUBLICADA'` vive en el **repositorio**
  (`porTomoParaEstudiante`), no en el controlador. Un endpoint nuevo no tiene
  forma de pedir tarjetas sin revisar.
- **Caché por hash**: `UNIQUE (tomo_id, contenido_hash)`. Corregir una tilde no
  invoca al modelo.
- **Sin ciclos**: flashcards nunca escribe en catalog (doc 10 §7).

Idempotencia: `flashcards.processed_events` (D13).
