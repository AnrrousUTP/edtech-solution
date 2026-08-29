# catalog-service — catálogo de eventos

## Publica (al bus `edtech-domain-events`)

| Evento                             | Payload                                                                                              | Cuándo                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `catalog.curso-publicado.v1`       | `cursoId, slug, titulo, tecnologia, nivelMin, nivelMax, precio, moneda, versionPrecio, estructura[]` | Al publicar un curso (invariantes doc 02 §5.2)                                               |
| `catalog.curso-despublicado.v1`    | `cursoId, motivo`                                                                                    | Al despublicar                                                                               |
| `catalog.contenido-actualizado.v1` | `cursoId, tomoId, contenidoHash, lecciones[{id,titulo,bloquesS3Key}]`                                | Al publicar el curso (una vez por tomo) y en cada edición de contenido de un curso publicado |
| `catalog.precio-actualizado.v1`    | `cursoId, montoAnterior, montoNuevo, moneda, versionPrecio`                                          | Cambio de precio de un curso publicado (sube `versionPrecio`)                                |

Notas:

- El contenido de los bloques viaja por S3 (`bloquesS3Key`), no por el evento:
  flashcards lo lee de ahí sin tocar la base de catalog (doc 02 §7.3).
- `contenidoHash` del tomo = sha256 de los hashes de sus lecciones → caché de
  regeneración de flashcards (doc 10 §5).

## Consume

Nada. `catalog` es el contexto río arriba (doc 02 §5.2).

## API interna (no eventos)

`GET /api/catalog/interno/bancos/:id/respuestas` — SOLO para la corrección de
evaluaciones de `enrollment-progress` (A-19): lectura, fuera del camino
caliente del estudiante, con token compartido, timeout y degradación del lado
del consumidor.
