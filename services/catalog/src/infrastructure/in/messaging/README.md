# Sin consumidores

`catalog-service` es el contexto río arriba: **no consume ningún evento**
(doc 02 §5.2). La tabla `catalog.processed_events` existe igual (D13) por si un
consumidor aparece en el futuro.
