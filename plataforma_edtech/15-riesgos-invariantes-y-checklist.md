# 15 — Riesgos, invariantes, checklist y deuda

## 1. Riesgos, por gravedad

| # | Riesgo | Mitigación |
|---|---|---|
| **R1** | **Costo de AWS descontrolado.** Un NAT Gateway, un Aurora que no pausa y seis Fargate corriendo 24/7 son ~$150-200/mes en un entorno `dev` que se usa unas horas al día | Doc 16 completo: 1 solo NAT + VPC endpoints · Aurora 0.5 ACU mínimo · Fargate Spot en dev · **AWS Budget con alarma al 80 %** desde F2, no al final · procedimiento de apagado probado en F12 |
| **R2** | **Migración fallida deja el servicio en crash loop.** El contenedor corre `drizzle-kit migrate` antes de escuchar: si falla, la tarea no arranca — **y el rollback de imagen corre la misma migración** | `IF (NOT) EXISTS` en todo · `lock_timeout='5s'` + `statement_timeout='60s'` al inicio de cada archivo · ensayo obligatorio contra una copia antes de aplicar · alarma de `RunningTaskCount < 1` · procedimiento de rollback documentado que incluye revertir la migración a mano |
| **R3** | **Pérdida de evento entre `guardar()` y `publish()`** (doc 04 §6). El proceso muere después de persistir y antes de publicar: los datos existen, el efecto en otro servicio nunca ocurre | Reconocido y **no resuelto en Fase 1**. Mitigación: job de reconciliación por servicio que compara estado y reemite (ej. matrículas `ACTIVA` sin insignia de "primer curso"). Solución real diferida: **patrón outbox** (tabla `outbox` + poller). Está en la deuda con dueño (§4) |
| **R4** | **Doble efecto por entrega at-least-once.** SQS y EventBridge entregan al menos una vez: sin idempotencia, se otorgan dos insignias, se habilitan dos matrículas | `processed_events` obligatorio en los 6 schemas (doc 03 §3) · PKs naturales que hacen idempotente el efecto (`progreso_lecciones`, `insignias_otorgadas`) · **test de idempotencia obligatorio por consumidor** (doc 12 §5) |
| **R5** | **DLQ que se llena en silencio.** Los eventos dejan de propagarse y nadie se entera hasta que un usuario reclama | Alarma de CloudWatch sobre `ApproximateNumberOfMessagesVisible > 0` en **cada** DLQ, desde F2 · alarma de `ApproximateAgeOfOldestMessage > 900 s` · las dos son de las primeras que se configuran |
| **R6** | **Firma del webhook de PayPal que no valida por el cuerpo re-serializado.** Express parsea el JSON, se re-serializa para verificar, el orden de claves cambia y la firma falla. Todos los pagos quedan sin confirmar | `express.raw({type:'application/json'})` en la ruta del webhook, **montado antes** del `express.json()` global · test que verifica que el handler recibe un `Buffer`, no un objeto · prueba manual contra un pago sandbox real en F8 |
| **R7** | **Model ID de Bedrock inexistente o no habilitado.** `AccessDeniedException` en runtime dentro de una Lambda, invisible hasta que alguien reclama | D8: resolución por CLI en build (doc 10 §2) · verificación de habilitación, no solo de existencia · `flashcards.generacion-fallida.v1` + alarma |
| **R8** | **Fuga de respuestas correctas.** `respuesta_correcta` o `solucion_esperada` en una respuesta HTTP: el test de nivelación deja de valer nada | I-5: mapper explícito, nunca `SELECT *` serializado · **test automatizado que hace grep sobre el body** de los endpoints de evaluación (doc 12 §5) |
| **R9** | **Agotamiento del pool de conexiones a Aurora.** Seis servicios × pool de 10 × auto scaling a 3 tareas = 180 conexiones contra un Aurora de 0.5 ACU que soporta bastante menos | Pool de **5 por tarea** en dev · alarma sobre `DatabaseConnections > 80 %` · cierre ordenado que libera el pool · si aprieta: **RDS Proxy** (anotado en deuda, no en Fase 1) |
| **R10** | **LocalStack ≠ AWS.** "Funciona en local" y falla en el despliegue: IAM, security groups, latencia, cold start | Doc 13 §7 lista explícitamente lo que no se reproduce · **F4-bis adelanta el primer despliegue real** (doc 14), que es la mitigación estructural, no una nota |
| **R11** | **Deriva de las proyecciones.** `enrollment.cursos_proyeccion` o `payments.precios_proyeccion` se desincronizan por un evento perdido: se cobra un precio viejo o se muestra un curso que ya no existe | Las proyecciones se pueden **reconstruir enteras** reprocesando eventos (comando administrativo por servicio) · job diario de conciliación · `version_precio` en la orden permite detectar el desfase después |
| **R12** | **Secreto de PayPal en el historial de Git.** Un `.env` commiteado sigue en el historial aunque se borre | `.gitignore` desde F0 · secretos **solo** en Secrets Manager (D17) · I-12: `git log -p \| grep -iE "client_secret\|AQ[A-Za-z0-9]{20,}"` vacío antes de cerrar · si aparece: rotar la credencial, no solo reescribir la historia |
| **R13** | **Escalada de privilegios a admin.** Un endpoint de "actualizar mi perfil" que acepta el campo `rol` | El grupo `admin` **no se asigna por API**, solo a mano en Cognito (doc 08 §6) · el mapper de entrada de perfil ignora `rol` explícitamente · test que envía `{"rol":"ADMIN"}` y exige que no cambie nada |
| **R14** | **Import cruzado entre servicios que nadie detecta.** Sin repos separados, la frontera depende de un script — y un glob mal escrito hace que el script no analice nada y pase siempre en verde | **Test negativo del harness** (doc 12 §6): archivos que violan las reglas a propósito, y el check debe fallar. Es lo que verifica al verificador |
| **R15** | **Cognito no está en LocalStack.** Federación social, MFA y rotación de refresh no se prueban en local | Emisor JWT local con la misma forma de token (doc 08 §8) · esos tres caminos se prueban **solo** contra AWS dev, y está escrito en F12 |
| **R16** | **El `webhook_id` atado a una URL que cambia.** Es el fallo más común de esta integración: PayPal llama a un dominio muerto y el pago deja de confirmarse **sin ningún error visible** | `dev` no usa ngrok: el webhook apunta al **ALB**, que no rota (doc 09 §6.2) · el `webhook_id` **no** se pide al operador, lo crea Fable en F8 de forma idempotente · para depurar en local, **dominio estático** de ngrok, nunca el aleatorio · primer paso de diagnóstico cuando "el pago no confirma" |
| **R17** | **Consistencia eventual visible al usuario.** Paga y el curso no aparece de inmediato | Diseñado, no escondido (doc 09 §2): polling de 15 s con mensaje honesto y salida al dashboard. **Nunca un error** cuando el dinero ya se cobró |
| **R18** | **`visibility_timeout` menor que el tiempo de proceso.** El mensaje se re-entrega mientras todavía se procesa | 180 s general, **600 s en flashcards** (Bedrock tarda) · regla: ≥ 6× el timeout del handler · la idempotencia lo cubre, pero es trabajo tirado |
| **R19** | **El seed de `dev` en producción.** Un `db:seed` apuntando al lugar equivocado | El seed verifica `NODE_ENV !== 'production'` y aborta · no está en el arranque del contenedor, es un comando aparte |
| **R20** | **Alucinación del modelo en material educativo.** Flashcards con APIs o sintaxis inventadas | HITL sin excepción (doc 10 §6) · regla explícita en el prompt · el filtro `PUBLICADA` está en el **repositorio**, no en el controlador (I-8) |
| **R21** | **Máquina de desarrollo con 8 GB y 9 contenedores.** El compose completo no entra cómodo | Perfiles de compose (doc 13 §6) · límites de memoria por contenedor · el servicio en desarrollo corre fuera de Docker con `--watch` |
| **R22** | **Bun con menos madurez que Node en alguna dependencia.** Una librería que asume APIs de Node y falla en Bun | Elección de Drizzle sobre Prisma (D9) por esta razón · `dependency-cruiser` corre bajo Node en CI · si algo no funciona en Bun, se aísla en un contenedor con Node y se documenta, no se abandona Bun |

## 2. Invariantes verificables

Cada uno es una afirmación que **se puede comprobar con un comando**. Si no se puede
comprobar, no es un invariante: es una intención.

| # | Invariante | Verificación |
|---|---|---|
| **I-1** | Ningún servicio importa código de otro | `bun run arch` (A4) + su test negativo |
| **I-2** | Reprocesar un evento no duplica su efecto | Test de idempotencia por consumidor; entregar dos veces → un solo efecto |
| **I-3** | Todo evento publicado valida contra su schema | Contract tests (doc 12 §5) |
| **I-4** | Un servicio no puede leer el schema de otro | `psql` con las credenciales de `a` sobre una tabla de `b` → `permission denied` |
| **I-5** | Ningún endpoint público devuelve respuestas correctas | Test de fuga con grep sobre el body |
| **I-6** | No hay progreso sin matrícula activa | Test de dominio sobre `Matricula.completarLeccion` |
| **I-7** | Una insignia se otorga una sola vez por (usuario, criterio, referencia) | PK de `insignias_otorgadas` + test de reproceso |
| **I-8** | Ninguna flashcard sin aprobar llega al estudiante | El filtro está en el repositorio + test |
| **I-9** | `pago-confirmado` se emite solo tras captura confirmada por PayPal | Test del handler: webhook `APPROVED` no emite; `CAPTURE.COMPLETED` sí |
| **I-10** | Un webhook con firma inválida nunca se procesa | Test con firma alterada → `firma_valida = false`, sin efecto |
| **I-11** | El monto de una orden no cambia después de crearla | Test de dominio: no hay operación que lo mute |
| **I-12** | No hay secretos en el repositorio ni en su historial | `git log -p \| grep -iE "client_secret\|AQ[A-Za-z0-9]{20,}"` vacío |
| **I-13** | El nivel de un usuario nunca baja | Test de `Nivel.maximo()` + test del handler |
| **I-14** | Toda cola tiene DLQ y toda DLQ tiene alarma | Script que recorre las colas con la CLI y verifica `RedrivePolicy` + alarma asociada |
| **I-15** | Ninguna task definition tiene un secreto en texto plano | `aws ecs describe-task-definition` + grep sobre `environment` (deben estar en `secrets`) |

## 3. Checklist de cierre

**Arquitectura**
- [ ] `bun run harness` en verde en los 6 servicios
- [ ] El test negativo del harness demuestra que las reglas fallan ante código malo (R14)
- [ ] I-1 e I-4 verificados por comando, no por lectura
- [ ] `events-catalog.md` de cada servicio coincide con el doc 05 §2

**Datos**
- [ ] 6 schemas con 6 roles y sin GRANT cruzado
- [ ] `processed_events` en los 6 schemas, usada por todos los consumidores
- [ ] Migraciones idempotentes, ensayadas contra una copia
- [ ] Seed de `dev` idempotente y bloqueado fuera de dev (R19)

**Mensajería**
- [ ] Bus + 8 reglas + 6 colas + 6 DLQ + 3 colas internas aplicadas
- [ ] Alarma en **cada** DLQ (I-14)
- [ ] Test de idempotencia en cada consumidor (I-2)
- [ ] Contract tests de los 26 eventos (I-3)

**Seguridad**
- [ ] Sin secretos en el repo ni en el historial (I-12)
- [ ] Task definitions con `valueFrom`, no valores literales (I-15)
- [ ] Roles IAM de mínimo privilegio, sin `Resource: "*"` salvo logs
- [ ] `admin` no asignable por API (R13), con su test
- [ ] Firma de webhook verificada sobre cuerpo crudo (I-10)
- [ ] Sin fuga de respuestas correctas (I-5)
- [ ] WAF activo, con el webhook de PayPal excluido del rate limit

**Producto**
- [ ] Flujo completo demostrado en local **y** en AWS dev
- [ ] Las 14 pantallas funcionan, sin hover con movimiento (D19)
- [ ] Accesible por teclado, con `prefers-reduced-motion` respetado
- [ ] HITL sin bypass (I-8)

**Operación**
- [ ] Dashboard de CloudWatch con los 5 paneles
- [ ] Budget con alarma al 80 % (R1)
- [ ] Costo real medido contra el doc 16
- [ ] **Procedimiento de apagado probado, no solo escrito**
- [ ] README raíz con arranque local y despliegue
- [ ] `DECISIONS.md` por servicio, con todo supuesto más allá de D1-D20

## 4. Deuda técnica declarada, con dueño

Lo que **conscientemente** no se hace en Fase 1. Escribirlo evita dos cosas: que se olvide,
y que alguien lo "descubra" dentro de tres meses como si fuera un fallo.

| # | Deuda | Por qué se difiere | Cuándo cobra |
|---|---|---|---|
| **B1** | **Patrón outbox** (R3) | Duplica la complejidad de cada handler; con el volumen de Fase 1 la ventana de pérdida es mínima | Al primer evento perdido en producción, o antes de facturación recurrente |
| **B2** | **RDS Proxy** (R9) | Un recurso más que pagar cuando 6 servicios × 5 conexiones alcanzan | Cuando el auto scaling pase de 2 tareas por servicio |
| **B3** | **Multi-tenant** | Fase 1 es B2C de un solo tenant; un `tenant_id` sin uso contamina cada agregado | Al primer cliente que quiera su propia instancia de marca |
| **B4** | **Video con MediaConvert** | El contenido de Fase 1 es texto y código | Al primer curso con video de verdad |
| **B5** | **Búsqueda con OpenSearch** | 3 cursos; `ILIKE` alcanza | Pasando los ~200 cursos |
| **B6** | **Push notifications (SNS/Pinpoint)** | Sin app móvil no hay destinatario | Con Flutter |
| **B7** | **App Flutter** (D7) | Alcance de Fase 1 | Fase 2 |
| **B8** | **ECS Service Connect** (D6) | La comunicación es asíncrona; no hay malla que justificar | Al aparecer llamadas síncronas entre servicios de verdad |
| **B9** | **Entorno `prod`** (D16) | Exige dominio, ACM, credenciales live y decisión de presupuesto | Antes del primer usuario real |
| **B10** | **Tutor conversacional con Bedrock** | El Agent queda montado (doc 10 §3) pero sin este caso de uso | Cuando el producto lo pida |
| **B11** | **Repetición espaciada real en flashcards** | Hoy el repaso es lineal; SM-2 o similar exige un modelo de memoria por tarjeta | Con datos de repaso suficientes para que valga |
| **B12** | **Backups probados con restauración** | Aurora hace snapshots; **restaurar nunca se probó** | Antes de `prod`. Un backup no probado no es un backup |
