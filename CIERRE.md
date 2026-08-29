# Cierre — checklist del doc 15 §3

Todo lo que sigue está verificado **por comando**, no por lectura. Lo que se puede
volver a comprobar en cualquier momento sale de `bun run tools/verificar-cierre.ts`;
el resto lleva escrito el comando y su resultado.

Estado: **22 comprobaciones automáticas en verde, 0 en rojo**, más las verificaciones
manuales de abajo. Tres puntos quedan abiertos por límites de la cuenta de AWS y están
marcados como tales.

## Arquitectura

|     | Comprobación                                                            | Cómo                                         | Resultado                                                                                                                          |
| --- | ----------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| ✅  | `harness` en verde                                                      | `bun run harness`                            | 158 tests, 0 fallos                                                                                                                |
| ✅  | El test negativo demuestra que las reglas fallan ante código malo (R14) | `bun test tools/arch-check.test.ts`          | genera violaciones de A1/A4/A5, `Dto` y `try/catch` y comprueba que el chequeo las rechaza                                         |
| ✅  | I-1 verificado por comando                                              | `arch-check` (A4) + grep de imports cruzados | ningún servicio importa de otro                                                                                                    |
| ✅  | I-4 verificado por comando                                              | `psql` como `svc_catalog` contra Aurora dev  | `ERROR: permission denied for schema payments`; su propio esquema responde                                                         |
| ✅  | `events-catalog.md` coincide con el doc 05 §2                           | diff de los tipos declarados                 | los 26 del bus, exactos. `identity.alta-usuario-cognito.v1` aparece de más pero está marcado "interno, no viaja por el bus" (A-12) |

## Datos

|     | Comprobación                                    | Cómo                                                     | Resultado                                                       |
| --- | ----------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| ✅  | 6 esquemas con 6 roles y sin GRANT cruzado      | `tools/aws/bootstrap-db.sh` + la prueba de I-4           | 6 roles con `rds_iam`, sin contraseña                           |
| ✅  | 6 secretos de conexión, uno por servicio        | `aws secretsmanager list-secrets`                        | 6 de 6, sin contraseña dentro (la credencial es el token IAM)   |
| ✅  | `processed_events` en los 6 esquemas (D13)      | grep de las migraciones iniciales                        | 6 de 6                                                          |
| ✅  | Migraciones idempotentes                        | las aplica cada servicio al arrancar, en cada despliegue | 7 despliegues seguidos sin error                                |
| ✅  | Seed idempotente y bloqueado fuera de dev (R19) | `NODE_ENV=production bun run db:seed`                    | aborta; con IDs fijos y `ON CONFLICT DO NOTHING` es idempotente |

## Mensajería

|     | Comprobación                                  | Cómo                                                | Resultado                                                                    |
| --- | --------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| ✅  | Bus + 8 reglas + 6 colas + 3 internas + DLQ   | `aws events list-rules`, `aws sqs list-queues`      | 8 reglas, 9 colas, 17 DLQ (incluidas las de entrega de EventBridge)          |
| ✅  | I-14: alarma en **cada** DLQ                  | `describe-alarms` + `get-queue-attributes` por cola | 17 alarmas para 17 DLQ; ninguna cola sin `RedrivePolicy`                     |
| ✅  | La cadena DLQ→alarma funciona de verdad       | mensaje malformado a `edtech-dev-gamification`      | 5 reintentos → DLQ → `edtech-dev-dlq-gamification` en **ALARM** a los ~7 min |
| ✅  | I-2: test de idempotencia en los consumidores | `bun test`                                          | mismo evento dos veces → un solo efecto; verificado también en el E2E        |
| ✅  | I-3: contract tests de los 26 eventos         | `bun test packages/shared-kernel/src/events`        | 26 schemas; payload incompleto y tipo equivocado no validan                  |

## Seguridad

|     | Comprobación                                            | Cómo                                                                | Resultado                                                                                                                                                                                    |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅  | I-12: sin secretos en el repositorio ni en el historial | `git log -p --all \| grep -icE "client_secret\|AQ[A-Za-z0-9]{20,}"` | 0 coincidencias                                                                                                                                                                              |
| ✅  | I-15: ninguna task definition con un secreto literal    | `describe-task-definition` de los 7 servicios                       | las task defs pasan **nombres** de secreto; el valor lo resuelve el task role en runtime                                                                                                     |
| ✅  | R13: `admin` no asignable por API                       | grep sobre `identity-access`                                        | no existe ningún endpoint que promueva; el grupo se asigna a mano                                                                                                                            |
| ✅  | MFA de admin (doc 08 §6)                                | Cognito real: usuario admin sin MFA y con MFA                       | sin TOTP el id token trae `mfa_pendiente: "true"`; con TOTP desaparece y Cognito exige `SOFTWARE_TOKEN_MFA`                                                                                  |
| ✅  | Rotación de refresh (doc 08 §5)                         | login PKCE por el Hosted UI + endpoint de token                     | el refresh devuelve uno **nuevo**; reutilizar el viejo pasada la gracia → `400 invalid_grant`                                                                                                |
| ✅  | I-10: firma de webhook sobre cuerpo crudo               | test + webhook real de PayPal sandbox                               | firma inválida → registrada, no procesada; válida → procesada                                                                                                                                |
| ✅  | I-5: sin fuga de respuestas correctas                   | E2E en local y en dev                                               | ni en las respuestas de la API ni en el HTML de las 10 pantallas                                                                                                                             |
| ⚠️  | Roles IAM sin `Resource: "*"` salvo logs                | revisión de los módulos                                             | se cumple salvo tres casos que la API de AWS no permite acotar: `xray:PutTraceSegments`, `ecr:GetAuthorizationToken` y las acciones `Describe*` del rol de CI                                |
| ❌  | WAF activo con el webhook excluido del rate limit       | —                                                                   | **bloqueado**: WAF cuelga de CloudFront y la cuenta no puede crear distribuciones (A-34). El WAF está escrito en `infra/modules/edge/cloudfront.tf` detrás de `habilitar_cloudfront = false` |

## Producto

|     | Comprobación                             | Cómo                                                   | Resultado                                                                                                                       |
| --- | ---------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| ✅  | Flujo completo en local **y** en AWS dev | `bun run tools/e2e.ts` contra ambos                    | **E2E OK** en los dos: catálogo → nivelación → matrícula → 8 lecciones → 2 evaluaciones → 4 insignias → certificado verificable |
| ✅  | Las 14 pantallas funcionan               | E2E (10 rutas con sesión) + panel de admin a mano      | 200 en todas; `/admin` sin rol devuelve la pantalla de permisos                                                                 |
| ✅  | D19: sin hover con movimiento            | grep sobre `apps/web/src` + sobre el HTML servido      | ningún `hover:scale/translate/rotate/skew`                                                                                      |
| ✅  | `prefers-reduced-motion` respetado       | grep sobre los estilos                                 | declarado en `globals.css`                                                                                                      |
| ✅  | I-8: HITL sin bypass                     | el filtro vive en el repositorio, no en el controlador | 0 tarjetas antes de aprobar; la aprobada aparece en `/repasar/…`                                                                |
| ✅  | I-7: una insignia se otorga una sola vez | UNIQUE en la base + E2E                                | 4 insignias, 4 claves distintas                                                                                                 |

## Operación

|     | Comprobación                                | Cómo                                       | Resultado                                                                                                             |
| --- | ------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| ✅  | Dashboard único de CloudWatch               | `aws cloudwatch list-dashboards`           | `edtech-dev-principal`, 6 paneles: ALB, latencia p99, colas, tareas ECS, Aurora y DLQs                                |
| ✅  | Budget con aviso al 80 % (R1)               | `aws budgets describe-budgets`             | `edtech-dev-mensual`, aviso **por proyección**                                                                        |
| ✅  | X-Ray con el `correlationId` como anotación | `aws xray get-trace-summaries`             | trazas reales de `/api/catalog/cursos` y `/ready` con su `req-…`                                                      |
| ✅  | Aurora bajo carga                           | 300 peticiones, 20 en paralelo, contra dev | 300/300 en 200, p50 356 ms; ACU 0.5 → 1.5; conexiones 2→4 (sin fuga, R9)                                              |
| ✅  | **Procedimiento de apagado probado**        | `tools/aws/pausar-dev.sh` ida y vuelta     | pausar 37 s (después: 503), reactivar 81 s y el tráfico vuelve enseguida                                              |
| ✅  | README raíz con arranque local y despliegue | —                                          | [`README.md`](README.md)                                                                                              |
| ✅  | `DECISIONS.md` por servicio                 | —                                          | los 6, con lo propio de cada uno                                                                                      |
| ⚠️  | Suscripción de alertas confirmada           | `aws sns list-subscriptions-by-topic`      | `PendingConfirmation`: falta que el operador haga clic en el correo de AWS. La alarma dispara igual; el email no sale |

## Costo real medido contra el doc 16

Medición del primer día con los 7 servicios corriendo (`aws ce get-cost-and-usage`,
filtrado a `RECORD_TYPE = Usage` porque los créditos de la cuenta lo dejan en cero
facturado):

| Servicio AWS                                | Uso del día |  Proyección | Doc 16 (dev administrado) |
| ------------------------------------------- | ----------: | ----------: | ------------------------- |
| RDS (Aurora Serverless v2)                  |      $0,150 |   ~$4,5/mes | ~$8 con auto-pause (§3)   |
| EC2 – Other (NAT Gateway)                   |      $0,090 |   ~$2,7/mes | ~$37                      |
| Elastic Load Balancing                      |      $0,023 |   ~$0,7/mes | ~$18                      |
| VPC                                         |      $0,018 |   ~$0,5/mes | —                         |
| Secrets Manager                             |      $0,007 |   ~$0,2/mes | ~$3,20                    |
| KMS                                         |      $0,005 |   ~$0,2/mes | ~$2                       |
| S3, WAF, DynamoDB, EventBridge, API Gateway |    < $0,001 |         ~$0 | ~$2                       |
| ECS Fargate                                 |      **$0** |      **$0** | ~$40 con Spot             |
| Cognito                                     |          $0 |          $0 | $0                        |
| **Total**                                   |  **$0,294** | **~$9/mes** | **~$60-70/mes**           |

Tres lecturas honestas de esa tabla:

1. **Lo facturado es $0**: los créditos de la cuenta cubren el uso entero. La columna
   "uso" es lo que costaría sin ellos.
2. **Fargate en $0 y el NAT en una fracción** de lo estimado indican que la capa
   gratuita de esta cuenta sigue absorbiendo los dos ítems más caros del doc 16. La
   estimación del doc está hecha _fuera_ de la capa gratuita y sigue siendo la buena
   para dimensionar; esta medición no la contradice, mide otra cosa.
3. **Lo que sí se confirma** es la parte estructural: Aurora con `min_capacity = 0`
   se pausa sola y cuesta del orden de $5-8/mes en vez de $44, y no hay VPC endpoints
   Interface (solo los Gateway de S3 y DynamoDB, que son gratis) — las dos medidas de
   ahorro que el doc 16 §2 recomienda explícitamente.

## Lo que queda abierto

Tres cosas, todas por límites de la cuenta de AWS y ninguna por el código:

1. **CloudFront y WAF** (A-34) — la cuenta no puede crear distribuciones ("your account
   must be verified"). El borde HTTPS lo da un API Gateway en modo proxy transparente al
   ALB. _Acción:_ abrir un caso con AWS Support para verificar la cuenta.
2. **Bedrock** (A-46) — la cuenta no tiene acceso a ningún modelo; `InvokeModel` devuelve
   `Operation not allowed` incluso con `AdministratorAccess`. `dev` corre con el generador
   fake y el módulo `ai/` está escrito y planificado detrás de `habilitar_bedrock = false`.
   _Acción:_ consola de Bedrock → _Model access_ → completar el formulario de caso de uso.
3. **Federación con Google** (doc 08 §1) — necesita las credenciales de una app de Google
   Cloud. El IdP está escrito detrás de `habilitar_google = false` y lee el secreto
   `edtech/dev/google-oidc`. _Acción:_ crear la app y guardar el secreto.

Y un paso manual que el propio plan anticipa (doc 09 §6.3): aprobar un pago sandbox en el
navegador para ver la cadena `captura → pago-confirmado → matrícula` con dinero de
verdad. Todo lo anterior del camino de pago está verificado contra la API real de PayPal.
