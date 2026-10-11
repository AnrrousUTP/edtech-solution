# ADR 021: programa de afiliados y terminal promocional local

Aceptado por el alcance solicitado para el proyecto de curso de UNI, 7 de octubre de 2026.

## Decisión

Ampliar los seis contextos originales con `affiliates` e `iot-terminals`, conservando aislamiento de esquema, eventos y capas. El programa termina en notificación e Ingresos; no incluye retiros ni pagos al afiliado. Porcentaje fijo del 5%, última referencia válida durante 30 días y atribución congelada en la orden.

Para la implementación local, instalar y ejecutar Bun dentro de contenedores Linux en Docker/WSL, con un volumen de dependencias separado de Windows. Esto mantiene el principio de D20 en el entorno solicitado por el usuario.

Usar Drizzle en los nuevos contextos. La confirmación de payments y sus eventos se persisten en una transacción mediante outbox; los consumidores deduplican por evento y orden. Las nuevas pruebas no sustituyen las originales.

La emulación de IoT Rules y Shadow se ubica en el adaptador `LocalIoTGateway` del servicio de terminales. MQTT se transporta realmente por Mosquitto; el proceso `terminal-simulator` aplica versiones y confirma avisos. Configuración y telemetría se guardan en el esquema de terminales; el adaptador convierte MQTT en SQS local. No se necesita un contenedor separado para ese puente.

Un solo terminal de demo, asignado por administrador. Cada cuenta puede participar como afiliado sin iniciar contenedores adicionales. Los tokens de vista previa son revocables y no exponen identidad ni ingresos.

## Límite

Esta entrega valida el recorrido local. La firma de atribución y la compra fake son independientes de credenciales reales. El adaptador IoT local exige endpoint local explícito y no se presenta como conectividad AWS ya validada. La activación cloud requiere el adaptador IoT de AWS, conexión Aurora/IAM, Terraform del nuevo runtime y smoke tests con la cuenta real según el plan; no ejecutar los contenedores locales contra AWS por cambiar una URL.
