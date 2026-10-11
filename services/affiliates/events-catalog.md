# Eventos de afiliados

Publica `affiliates.afiliado-activado.v1` y `affiliates.comision-registrada.v1` mediante outbox.
Consume `payments.venta-referida-confirmada.v1`, `payments.pago-reembolsado.v1` y publicación/despublicación de cursos.
Una comisión por orden. Evento y movimiento/notificación se guardan en la misma transacción.
