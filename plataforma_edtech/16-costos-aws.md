# 16 — Costos de AWS

> Estimación de `dev` en `us-east-1`, órdenes de magnitud a agosto de 2026 y **fuera de la
> capa gratuita** (se asume una cuenta con más de 12 meses). Sirve para decidir, no para
> facturar: los precios cambian y hay que confirmarlos en la calculadora de AWS.

## 1. `dev` corriendo 24/7 — el escenario caro

| Recurso | Configuración | ~USD/mes |
|---|---|---|
| **NAT Gateway** | 1 unidad, ~10 GB de tráfico | **~$37** |
| **Aurora PostgreSQL Serverless v2** | 0.5 ACU mínimo, 24/7 | **~$44** |
| Aurora almacenamiento | ~5 GB | ~$0,50 |
| **ECS Fargate** | 6 servicios × 0.5 vCPU / 1 GB, 24/7 | **~$105** |
| ECS Fargate (con **Spot** en 5 de 6) | mismo cómputo, ~70 % menos en los Spot | **~$40** |
| ALB | 1, tráfico bajo | ~$18 |
| VPC endpoints Interface | 5 endpoints × 2 AZ | ~$29 |
| ECR | 7 repos, ~5 GB | ~$0,50 |
| S3 | ~5 GB + peticiones | ~$0,50 |
| CloudFront | ~10 GB salida | ~$1 |
| EventBridge | ~50k eventos | ~$0,05 |
| SQS | ~200k peticiones | ~$0,08 |
| Secrets Manager | 8 secretos | ~$3,20 |
| KMS | 2 claves | ~$2 |
| CloudWatch Logs | ~2 GB, retención 7 días | ~$1 |
| CloudWatch alarmas | 12 | ~$1,20 |
| X-Ray | ~100k trazas | ~$0,50 |
| Cognito | < 50.000 MAU | **$0** |
| Bedrock | ~20 generaciones | ~$1 |
| Route53 | 1 zona | ~$0,50 |
| WAF | 1 web ACL + 3 reglas | ~$8 |
| **Total 24/7, con Spot** | | **≈ $190/mes** |

## 2. Los tres ítems que son el 70 %

**1. Fargate (~$105 sin Spot, ~$40 con Spot).** Seis contenedores corriendo todo el mes
para un entorno que se usa unas horas al día. Con Fargate Spot en los cinco servicios sin
webhook (doc 07 §6), baja a ~$40.

**2. Aurora Serverless v2 (~$44).** El mínimo de 0.5 ACU cuesta ~$0,06/hora **aunque nadie
consulte**. Serverless v2 **sí** puede escalar a cero (auto-pause), pero hay que
configurarlo — con el mínimo en 0 ACU y una pausa tras 5 minutos de inactividad, un `dev`
usado 4 h al día cuesta **~$8** en vez de $44. El precio es una latencia de reactivación de
unos segundos en la primera consulta, perfectamente aceptable en `dev`.

**3. NAT Gateway (~$37).** Cuesta ~$0,045/hora esté o no en uso, más el tráfico. Es
irreductible mientras haya tareas en subred privada que necesiten salir a internet. Los
VPC endpoints (doc 07 §9) no eliminan el NAT, pero **sí** el grueso de su tráfico: sin
ellos, cada `docker pull` de ECR y cada lectura de Secrets Manager pasaría por ahí.

> Y ojo con la ironía de los endpoints: cinco endpoints Interface en dos AZ cuestan ~$29,
> casi lo mismo que el NAT que ayudan a abaratar. **En `dev` conviene dejar solo los
> endpoints Gateway de S3 y DynamoDB (que son gratis)** y aceptar que el resto salga por el
> NAT. Los endpoints Interface se justifican en `prod`, donde el volumen de tráfico cambia
> la ecuación. Con esa corrección, `dev` baja otros ~$29.

## 3. `dev` administrado con cabeza

| Medida | Ahorro |
|---|---|
| Fargate Spot en 5 de 6 servicios | −$65 |
| Aurora con auto-pause (mínimo 0 ACU) | −$36 |
| Sin VPC endpoints Interface en dev (§2) | −$29 |
| Apagar los servicios ECS fuera de horario (`desired_count = 0`) | −$25 adicionales |
| Retención de logs 7 días en vez de indefinida | −$5 |
| **Total administrado** | **≈ $60-70/mes** |

## 4. Procedimiento de apagado

Dos niveles. **El de pausa hay que probarlo en F12**, no solo escribirlo: un procedimiento
de apagado que nadie ejecutó nunca falla justo cuando se necesita.

### Pausa nocturna (~$40/mes, se reactiva en 3 minutos)

```bash
# tools/aws/pausar-dev.sh
for s in identity-access catalog enrollment-progress gamification flashcards payments; do
  aws ecs update-service --cluster edtech-dev-cluster --service edtech-dev-svc-$s --desired-count 0
done
# Aurora se pausa solo si tiene min_capacity = 0
```

Reactivar: el mismo script con `--desired-count 1`.

### Apagado profundo (~$5/mes, se reconstruye en ~20 minutos)

```bash
cd infra/envs/dev
terraform destroy -target=module.compute_base -target=module.services
# Conservar: network, database (con snapshot final), messaging, registry, storage
```

Lo que queda vivo y por qué: el bucket de state (imprescindible), las imágenes ECR (para no
reconstruir), el snapshot de Aurora (para no perder los datos de prueba) y S3.

**Reconstrucción:** `terraform apply` de `compute-base` y `services`, restaurar Aurora
desde el snapshot, `bun run db:seed`. ~20 minutos.

## 5. Presupuesto y alarma

Se crea en **F2**, no al final. Es la diferencia entre enterarse en el día 3 y enterarse en
la factura.

```hcl
resource "aws_budgets_budget" "dev" {
  name         = "edtech-dev-mensual"
  budget_type  = "COST"
  limit_amount = "120"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  cost_filter { name = "TagKeyValue", values = ["user:Project$edtech"] }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"          # avisa por proyección, no por hecho consumado
    subscriber_email_addresses = [var.email_alertas]
  }
}
```

`FORECASTED` es lo importante: avisa cuando la **proyección** del mes supera el umbral, no
cuando ya se gastó.

**Cost Explorer agrupado por la etiqueta `Service`** (doc 07 §2) responde de inmediato qué
servicio se está comiendo el presupuesto. Sin esa etiqueta, la factura es un número único e
inútil.

## 6. Si esto fuera a `prod`

Orden de magnitud para dimensionar la decisión de B9 (doc 15 §4), con tráfico bajo
(≈1.000 usuarios activos):

| | ~USD/mes |
|---|---|
| Aurora 1-4 ACU + réplica | ~$180 |
| Fargate 12 tareas (2 por servicio, sin Spot) | ~$210 |
| 2 NAT Gateway | ~$74 |
| ALB + WAF + CloudFront | ~$45 |
| VPC endpoints Interface (acá sí se justifican) | ~$29 |
| Resto (logs, secretos, KMS, X-Ray, SES) | ~$30 |
| **Total** | **≈ $570/mes** |

Con un curso a $19.90 y ~5,4 % de comisión de PayPal, la infraestructura de `prod` se paga
con alrededor de **30 ventas al mes**. Es el número que hay que tener a mano antes de
decidir si `prod` se enciende.
