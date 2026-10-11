# Afiliados y terminal IoT — guía local

Alcance UNI: QR permanente → compra simulada → comisión del 5% → notificación → Ingresos. No hay transferencias ni retiros.

## Ejecutar desde PowerShell en la raíz del proyecto

```powershell
.\tools\local\afiliados.ps1 up
.\tools\local\afiliados.ps1 seed
.\tools\local\afiliados.ps1 test
.\tools\local\afiliados.ps1 demo
```

El lanzador combina el Compose base, Anrrous Dev y `docker-compose.afiliados.yml`. Conserva el `.env` existente sin imprimirlo, carga los puertos de Anrrous Dev, construye los contenedores y prepara los nuevos esquemas incluso si el volumen Postgres ya existía. Las claves de firma se generan dentro del bootstrap y se guardan en LocalStack; no se escriben en el repositorio.

El lanzador de PowerShell mantiene una sesión WSL oculta mientras corre la demo. WSL puede apagar su instancia aunque los servicios systemd/Docker estén activos cuando ya no queda un cliente WSL conectado ([documentación de Microsoft](https://learn.microsoft.com/en-us/windows/wsl/systemd)). `stop` detiene los contenedores y libera esa sesión mediante una señal específica del proyecto. `start` reanuda las imágenes existentes sin construirlas de nuevo. No cambia la configuración global de WSL ni el firewall.

La instalación/pruebas usan Bun en Linux y `edtech-bun-deps`; no se reemplaza el `node_modules` de Windows. El checkout permanece en su ubicación actual. Si el build o los watchers son lentos en `/mnt/d`, se puede trabajar desde un checkout propio en filesystem nativo de WSL.

`seed` agrega un curso de demostración, Python Aplicado, de USD 40, con contenidos locales, y publica por la API los cursos de demo. Las compras no contactan PayPal. `test` usa cuentas/órdenes locales de prueba y comprueba ingresos, permisos, QR decodificado, duplicados, reembolsos y MQTT; puede reasignar el terminal de demo durante su ejecución.

El bootstrap también sincroniza por eventos los cursos de demo que ya estaban publicados antes de añadir afiliados. `demo` prepara Ana con su enlace a Python, asigna el terminal y hace una compra simulada desde la propia web usando un comprador de demostración separado. Deja USD 2 y su notificación; repetir `demo` conserva esa compra. Bruno sigue disponible para una compra manual. Ejecutar `demo` después de `test` devuelve el terminal a Ana.

## Acceso

- Web: http://localhost:3100
- Programa: http://localhost:3100/afiliados
- Administración: http://localhost:3100/admin/afiliados
- Terminales: http://localhost:3100/admin/terminales
- Gateway: http://localhost:8180

| Cuenta local        | Contraseña de demo | Uso           |
| ------------------- | ------------------ | ------------- |
| `ana@edtech.test`   | `AnaDemo123`       | Afiliada      |
| `bruno@edtech.test` | `BrunoDemo123`     | Comprador     |
| `admin@edtech.test` | `AdminLocal1`      | Administrador |

Estas cuentas existen solo en `jwt-local`, no en Cognito. Otras personas pueden registrarse en el proveedor local; su código de confirmación de desarrollo es `123456`. El proveedor local conserva las cuentas registradas en memoria; las cuentas de demo se recrean al iniciar. Los registros de afiliados/ingresos se conservan en Postgres.

## Demostración manual

1. Iniciar sesión como Ana y abrir Afiliados. Activar el programa y obtener su QR.
2. Elegir Python Aplicado como destino, descargar o copiar el enlace.
3. Abrirlo en otra sesión o ventana privada; iniciar sesión como Bruno y comprar el curso.
4. Volver al panel de Ana: aparece USD 2 en Ingresos y la notificación. Las vistas se actualizan cada 10 s cuando la pestaña es visible.
5. Ana solicita un terminal. El administrador lo asigna desde Terminales. Ana cambia su mensaje promocional y abre la pantalla mediante el enlace de vista previa.
6. Otra venta genera un aviso MQTT. El dispositivo lo confirma y la vista muestra «Nueva venta confirmada».

Cada comprador solo puede comprar una vez el mismo curso mientras conserve una compra capturada; usar una nueva cuenta para repetir una venta. Volver a capturar una orden o recibir un evento repetido no genera otra comisión.

Ingresos suma las comisiones netas; el historial conserva el importe original y ajustes por reembolso. Las vistas privadas no muestran identidad del comprador. La administración muestra hasta 100 registros recientes; el historial personal pagina de 50 en 50.

## Teléfono y QR

Para un teléfono, `localhost` apunta al teléfono. Antes de levantar la demo, definir una URL de Windows accesible desde la misma LAN:

```powershell
$env:PUBLIC_APP_BASE_URL = 'http://<IP-del-equipo>:3100'
.\tools\local\afiliados.ps1 up
```

El lanzador transmite esa URL a WSL. Cuando se lance directamente dentro de WSL, exportar la misma variable allí. Comprobar acceso del teléfono y reglas del firewall sin desactivar globalmente el firewall. El QR se genera con esa URL. En la entrega cloud debe utilizarse un dominio HTTPS.

## Dispositivo y operación

MQTT queda ligado a loopback en el puerto 1884; el simulador y el puente usan la red Docker con credenciales y ACL exclusivamente de demo. El heartbeat es de 30 s y el terminal aparece desconectado después de 90 s. Un mensaje pendiente caduca después de una hora. El estado del simulador persiste en su volumen y deduplica avisos al reconectar.

```powershell
.\tools\local\afiliados.ps1 status
.\tools\local\afiliados.ps1 stop
```

Detener no elimina los volúmenes ni el historial. No usar `down -v` para intentar resolver una falla: eliminaría datos de demo existentes. Las colas y secretos de LocalStack no deben tratarse como una garantía de persistencia equivalente a AWS; conservar Postgres y volver a ejecutar la preparación si se reconstruye el entorno.

La flag `EDTECH_AFFILIATES_ENABLED` se activa en el override de afiliados. El Compose base conserva el comportamiento anterior cuando no se utiliza ese override. El broker no procesa dinero ni detecta la cámara del visitante; las visitas se registran al abrir la URL y las comisiones dependen de payments.

## Verificación de esta entrega

- Construcción de las imágenes Docker y compilación de Next.js: correctas.
- Tipos de affiliates, iot-terminals, payments y terminal-simulator: correctos.
- Arquitectura, dependencias, estructura y convenciones: correctas.
- Pruebas del repositorio: 176 aprobadas, 0 fallidas. Las 12 pruebas de integración originales que requieren configuración específica siguen omitidas en el harness general; no se cuentan como aprobadas.
- E2E nuevo contra Docker/LocalStack/MQTT: 47 comprobaciones aprobadas, incluyendo el QR PNG decodificado, USD 40 → USD 2, duplicados, permisos, reembolsos parciales y aviso confirmado por el simulador.
- Compra desde la web: cookie de referencia, creación/captura, ingreso y aviso MQTT verificados con Ana.
- Desconexión/reconexión: heartbeat detecta la caída, la configuración queda pendiente y se aplica al volver, sin alterar QR ni ingresos.
- Navegador: inicio de sesión, activación, QR, ingreso visible, administración de afiliados/comisiones/terminales y adaptación del QR a un ancho efectivo de teléfono comprobados.

Para repetir la prueba de reconexión después de preparar `demo`:

```powershell
.\tools\local\afiliados.ps1 reconnect-test
```

Detiene solamente el simulador; restaura su ejecución incluso si una comprobación falla. Puede tardar unos dos minutos porque espera el umbral de desconexión. Las verificaciones locales también están definidas en `.github/workflows/afiliados-local.yml`; ese workflow fue añadido, pero no se ha ejecutado en GitHub durante esta entrega.

## AWS

No se requiere AWS para ejecutar esta guía. Esta implementación usa un adaptador IoT local, una base Docker y pago fake. Los pasos cloud del plan permanecen como fase posterior: adaptador AWS IoT/SigV4, Aurora/IAM, Terraform del runtime, imágenes y validación de permisos/red. Un `terraform apply` del proyecto actual no activa automáticamente estos nuevos contenedores.
