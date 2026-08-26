# 03 — Modelo de datos

> **Un clúster Aurora PostgreSQL Serverless v2, seis schemas, seis roles.** Cada servicio
> se conecta con un usuario que solo tiene `USAGE` sobre **su** schema. El aislamiento no
> es una convención: está en los GRANTs y se verifica con un test (I-4, doc 15).

## 1. Layout de schemas y roles

| Schema | Rol de conexión | Secreto en Secrets Manager |
|---|---|---|
| `identity` | `svc_identity` | `edtech/dev/db/identity` |
| `catalog` | `svc_catalog` | `edtech/dev/db/catalog` |
| `enrollment` | `svc_enrollment` | `edtech/dev/db/enrollment` |
| `gamification` | `svc_gamification` | `edtech/dev/db/gamification` |
| `flashcards` | `svc_flashcards` | `edtech/dev/db/flashcards` |
| `payments` | `svc_payments` | `edtech/dev/db/payments` |

Bootstrap (corre una sola vez, desde el módulo `database/` con el usuario maestro):

```sql
-- por cada servicio <s>
CREATE SCHEMA IF NOT EXISTS <s>;
CREATE ROLE svc_<s> LOGIN PASSWORD :'pwd_<s>';
GRANT USAGE, CREATE ON SCHEMA <s> TO svc_<s>;
ALTER ROLE svc_<s> SET search_path = <s>;
-- y, lo que hace que el aislamiento sea real:
REVOKE ALL ON SCHEMA <s> FROM PUBLIC;
REVOKE ALL ON DATABASE edtech FROM PUBLIC;
GRANT CONNECT ON DATABASE edtech TO svc_<s>;
```

**Invariante I-4:** para todo par de servicios distintos `a`, `b`, la conexión de `svc_a`
debe fallar con `permission denied for schema b` al intentar `SELECT` sobre cualquier
tabla de `b`. Es un test automatizado, no una inspección.

> **Por qué un solo clúster y no seis.** Seis clústeres Aurora en `dev` es dinero tirado
> (doc 16). El aislamiento que importa para microservicios es **lógico** — que un servicio
> no pueda leer los datos de otro — y eso se consigue con schemas + roles. Si algún día un
> servicio necesita escalar o versionar su base aparte, mover un schema a su propio clúster
> es una migración contenida, precisamente porque nadie más lo consulta.

## 2. Convenciones transversales

- Claves primarias: `uuid` generado con `gen_random_uuid()` (extensión `pgcrypto`).
- Timestamps: `timestamptz`, **siempre UTC**. Nada de `timestamp` sin zona.
- Toda tabla lleva `created_at timestamptz NOT NULL DEFAULT now()` y
  `updated_at timestamptz NOT NULL DEFAULT now()`.
- Estados: tipos `enum` de Postgres, no `text` con CHECK.
- Dinero: `numeric(12,2)` + `moneda char(3)`. **Nunca `float`.**
- Borrado: lógico (`deleted_at timestamptz`) en contenido; físico solo en datos de repaso.
- Migraciones: `drizzle-kit generate` + `drizzle-kit migrate` (D9), un directorio de
  migraciones **por servicio**, aplicadas por el contenedor al arrancar.
- Toda migración abre con `SET lock_timeout = '5s'; SET statement_timeout = '60s';`.

## 3. La tabla que va en los seis schemas: `processed_events`

Consecuencia directa de que EventBridge y SQS entregan **at-least-once** (D13). Sin esto,
un reintento otorga la insignia dos veces o habilita la matrícula dos veces.

```sql
CREATE TABLE <schema>.processed_events (
  event_id      uuid PRIMARY KEY,
  event_type    text        NOT NULL,
  processed_at  timestamptz NOT NULL DEFAULT now(),
  resultado     text        NOT NULL          -- 'OK' | 'IGNORADO' | 'ERROR'
);
CREATE INDEX ON <schema>.processed_events (processed_at);
```

**Uso obligatorio en todo consumidor**, dentro de la *misma* transacción que el efecto:

```
BEGIN;
  INSERT INTO processed_events (event_id, event_type, resultado)
  VALUES ($1, $2, 'OK')
  ON CONFLICT (event_id) DO NOTHING;
  -- si rowCount = 0 → ya se procesó → COMMIT y ACK del mensaje, sin hacer nada más
  ... efecto de negocio ...
COMMIT;
```

Retención: un job diario borra filas con `processed_at < now() - interval '30 days'`.
30 días cubre de sobra la vida máxima de un mensaje en DLQ (14 días).

## 4. `identity`

```sql
CREATE TYPE identity.rol_dominio  AS ENUM ('ESTUDIANTE','ADMIN');
CREATE TYPE identity.origen_nivel AS ENUM ('TEST','AUTODECLARADO','PROGRESION');

CREATE TABLE identity.usuarios (
  id             uuid PRIMARY KEY,             -- = sub de Cognito, NO se genera acá
  email          citext NOT NULL UNIQUE,
  nombre_visible text   NOT NULL,
  avatar_url     text,
  pais           char(2),
  idioma         char(2) NOT NULL DEFAULT 'es',
  rol            identity.rol_dominio  NOT NULL DEFAULT 'ESTUDIANTE',
  nivel          char(1) NOT NULL DEFAULT 'A' CHECK (nivel BETWEEN 'A' AND 'N'),
  origen_nivel   identity.origen_nivel NOT NULL DEFAULT 'AUTODECLARADO',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identity.preferencias (
  usuario_id uuid PRIMARY KEY REFERENCES identity.usuarios(id) ON DELETE CASCADE,
  notif_email boolean NOT NULL DEFAULT true,
  recordatorio_racha boolean NOT NULL DEFAULT true,
  zona_horaria text NOT NULL DEFAULT 'America/Lima'
);
```

El `id` viene del `sub` de Cognito (D2) — el servicio **nunca** lo genera. Ver doc 08 §4.

## 5. `catalog`

```sql
CREATE TYPE catalog.estado_pub AS ENUM ('BORRADOR','PUBLICADO','DESPUBLICADO');
CREATE TYPE catalog.tipo_bloque AS ENUM ('TEXTO','CODIGO','VIDEO','IMAGEN','CALLOUT');
CREATE TYPE catalog.tipo_pregunta AS ENUM ('OPCION_UNICA','OPCION_MULTIPLE','CODIGO','VERDADERO_FALSO');
CREATE TYPE catalog.uso_banco AS ENUM ('NIVELACION','EVALUACION_TOMO','DIAGNOSTICO_PREVIO');

CREATE TABLE catalog.carreras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  titulo text NOT NULL,
  descripcion text NOT NULL,
  imagen_url text,
  estado catalog.estado_pub NOT NULL DEFAULT 'BORRADOR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE catalog.cursos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  titulo text NOT NULL,
  descripcion text NOT NULL,
  tecnologia text NOT NULL,                    -- 'HTML' | 'CSS' | 'EXPRESS' | ...
  nivel_min char(1) NOT NULL CHECK (nivel_min BETWEEN 'A' AND 'N'),
  nivel_max char(1) NOT NULL CHECK (nivel_max BETWEEN 'A' AND 'N'),
  precio numeric(12,2) NOT NULL DEFAULT 0,
  moneda char(3) NOT NULL DEFAULT 'USD',
  version_precio int NOT NULL DEFAULT 1,       -- sube en cada cambio de precio
  imagen_url text,
  estado catalog.estado_pub NOT NULL DEFAULT 'BORRADOR',
  publicado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (nivel_max >= nivel_min)
);

CREATE TABLE catalog.carrera_cursos (
  carrera_id uuid NOT NULL REFERENCES catalog.carreras(id) ON DELETE CASCADE,
  curso_id   uuid NOT NULL REFERENCES catalog.cursos(id)   ON DELETE CASCADE,
  orden int NOT NULL,
  PRIMARY KEY (carrera_id, curso_id),
  UNIQUE (carrera_id, orden) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE catalog.tomos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id uuid NOT NULL REFERENCES catalog.cursos(id) ON DELETE CASCADE,
  orden int NOT NULL,
  titulo text NOT NULL,
  descripcion text,
  umbral_aprobacion int NOT NULL DEFAULT 70 CHECK (umbral_aprobacion BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (curso_id, orden) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE catalog.lecciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tomo_id uuid NOT NULL REFERENCES catalog.tomos(id) ON DELETE CASCADE,
  orden int NOT NULL,
  titulo text NOT NULL,
  duracion_min int NOT NULL DEFAULT 10,
  contenido_hash text NOT NULL,                -- sha256 del array de bloques → caché de flashcards
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tomo_id, orden) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE catalog.bloques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leccion_id uuid NOT NULL REFERENCES catalog.lecciones(id) ON DELETE CASCADE,
  orden int NOT NULL,
  tipo catalog.tipo_bloque NOT NULL,
  contenido jsonb NOT NULL,                    -- {markdown} | {lenguaje, codigo} | {s3_key, duracion}
  UNIQUE (leccion_id, orden) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE catalog.ejercicios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leccion_id uuid NOT NULL REFERENCES catalog.lecciones(id) ON DELETE CASCADE,
  enunciado text NOT NULL,
  solucion_esperada jsonb NOT NULL,            -- NUNCA sale por la API pública
  pistas jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE catalog.bancos_pregunta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uso catalog.uso_banco NOT NULL,
  tomo_id uuid REFERENCES catalog.tomos(id) ON DELETE CASCADE,  -- NULL si uso = NIVELACION
  titulo text NOT NULL,
  CHECK ((uso = 'NIVELACION') = (tomo_id IS NULL))
);

CREATE TABLE catalog.preguntas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banco_id uuid NOT NULL REFERENCES catalog.bancos_pregunta(id) ON DELETE CASCADE,
  tipo catalog.tipo_pregunta NOT NULL,
  nivel char(1) CHECK (nivel BETWEEN 'A' AND 'N'),  -- obligatorio en bancos de NIVELACION
  enunciado text NOT NULL,
  opciones jsonb NOT NULL DEFAULT '[]',        -- [{id, texto}] — sin marcar la correcta
  respuesta_correcta jsonb NOT NULL,           -- NUNCA sale por la API pública
  puntaje int NOT NULL DEFAULT 1
);
CREATE INDEX ON catalog.preguntas (banco_id, nivel);
```

> **Invariante I-5 (fuga de respuestas).** `respuesta_correcta` y `solucion_esperada` no
> pueden aparecer en ninguna respuesta HTTP de la API de contenido. Se garantiza con un
> mapper explícito en `infrastructure/in/http/` (nunca `SELECT *` serializado) **y** con un
> test que pega a `/api/catalog/tomos/:id/evaluacion` y hace `grep` de las claves en el
> body. Es la fuga más fácil de cometer y la más cara.

## 6. `enrollment`

```sql
CREATE TYPE enrollment.estado_matricula AS ENUM ('ACTIVA','REVOCADA','EXPIRADA');
CREATE TYPE enrollment.estado_intento   AS ENUM ('EN_CURSO','ENTREGADO');
CREATE TYPE enrollment.tipo_evaluacion  AS ENUM ('NIVELACION','TOMO','DIAGNOSTICO_PREVIO');
CREATE TYPE enrollment.origen_matricula AS ENUM ('PAGO','ALTA_MANUAL','GRATUITO');

CREATE TABLE enrollment.matriculas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  curso_id   uuid NOT NULL,
  estado enrollment.estado_matricula NOT NULL DEFAULT 'ACTIVA',
  origen enrollment.origen_matricula NOT NULL,
  orden_id uuid,                               -- id de la orden en payments; solo referencia
  acceso_hasta timestamptz,                    -- NULL = acceso perpetuo
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, curso_id)
);

-- Proyección local del catálogo (D14). Se alimenta SOLO de eventos de catalog.
CREATE TABLE enrollment.cursos_proyeccion (
  curso_id uuid PRIMARY KEY,
  titulo text NOT NULL,
  slug text NOT NULL,
  publicado boolean NOT NULL,
  estructura jsonb NOT NULL,   -- [{tomo_id, orden, titulo, umbral, lecciones:[{id,orden,titulo}]}]
  actualizado_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE enrollment.progreso_lecciones (
  matricula_id uuid NOT NULL REFERENCES enrollment.matriculas(id) ON DELETE CASCADE,
  leccion_id uuid NOT NULL,
  tomo_id uuid NOT NULL,
  completada_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (matricula_id, leccion_id)       -- la PK es lo que hace idempotente el completar
);
CREATE INDEX ON enrollment.progreso_lecciones (matricula_id, tomo_id);

CREATE TABLE enrollment.progreso_tomos (
  matricula_id uuid NOT NULL REFERENCES enrollment.matriculas(id) ON DELETE CASCADE,
  tomo_id uuid NOT NULL,
  completado_at timestamptz,
  mejor_puntaje int,
  PRIMARY KEY (matricula_id, tomo_id)
);

CREATE TABLE enrollment.intentos_evaluacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  tipo enrollment.tipo_evaluacion NOT NULL,
  banco_id uuid NOT NULL,
  matricula_id uuid REFERENCES enrollment.matriculas(id),  -- NULL en NIVELACION
  tomo_id uuid,
  estado enrollment.estado_intento NOT NULL DEFAULT 'EN_CURSO',
  puntaje int,
  aprobado boolean,
  nivel_resultante char(1),                    -- solo en NIVELACION
  iniciado_at timestamptz NOT NULL DEFAULT now(),
  entregado_at timestamptz,
  CHECK ((tipo = 'NIVELACION') = (matricula_id IS NULL))
);
CREATE INDEX ON enrollment.intentos_evaluacion (usuario_id, tipo, entregado_at DESC);

CREATE TABLE enrollment.respuestas_intento (
  intento_id  uuid NOT NULL REFERENCES enrollment.intentos_evaluacion(id) ON DELETE CASCADE,
  pregunta_id uuid NOT NULL,
  respuesta jsonb NOT NULL,
  correcta boolean,
  PRIMARY KEY (intento_id, pregunta_id)
);
```

> **Nota sobre `usuario_id` y `curso_id` sin FK.** Apuntan a agregados de **otros**
> servicios, así que no puede haber foreign key — y está bien: es exactamente lo que
> significa una frontera de servicio. La consistencia se sostiene por eventos, no por el
> motor. Lo que sí hay es un job de conciliación (doc 15, R11) que detecta matrículas
> apuntando a cursos que ya no existen en la proyección.

## 7. `gamification`

```sql
CREATE TYPE gamification.tipo_certificado AS ENUM ('MENOR','MAYOR');
CREATE TYPE gamification.criterio_insignia AS ENUM
  ('CURSO_COMPLETADO','CARRERA_COMPLETADA','RACHA_7','RACHA_30','RACHA_100',
   'PRIMER_CURSO','EVALUACION_PERFECTA','MADRUGADOR','MARATON');

CREATE TABLE gamification.perfiles (
  usuario_id uuid PRIMARY KEY,
  puntos int NOT NULL DEFAULT 0,
  racha_actual int NOT NULL DEFAULT 0,
  racha_maxima int NOT NULL DEFAULT 0,
  ultima_actividad date,
  zona_horaria text NOT NULL DEFAULT 'America/Lima',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE gamification.insignias_otorgadas (
  usuario_id uuid NOT NULL,
  criterio gamification.criterio_insignia NOT NULL,
  referencia_id uuid,                          -- curso_id o carrera_id según el criterio
  otorgada_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, criterio, referencia_id)   -- I-7: una sola vez
);

CREATE TABLE gamification.certificados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  tipo gamification.tipo_certificado NOT NULL,
  referencia_id uuid NOT NULL,                 -- curso_id (MENOR) o carrera_id (MAYOR)
  titulo text NOT NULL,
  nombre_titular text NOT NULL,                -- congelado al emitir
  codigo_verificacion text NOT NULL UNIQUE,    -- público, para /verificar/:codigo
  pdf_s3_key text,                             -- NULL mientras el worker no lo generó
  emitido_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, tipo, referencia_id)
);
```

`referencia_id` es `NOT NULL` en la PK de insignias, así que los criterios sin referencia
(rachas) usan el UUID nulo `'00000000-0000-0000-0000-000000000000'`. Documentado a
propósito: es más simple que un índice parcial y hace la PK uniforme.

## 8. `flashcards`

```sql
CREATE TYPE flashcards.estado_tarjeta AS ENUM ('PENDIENTE_REVISION','PUBLICADA','RECHAZADA');
CREATE TYPE flashcards.estado_mazo    AS ENUM ('GENERANDO','EN_REVISION','PUBLICADO','FALLIDO');

CREATE TABLE flashcards.mazos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tomo_id uuid NOT NULL,
  curso_id uuid NOT NULL,
  version int NOT NULL DEFAULT 1,
  contenido_hash text NOT NULL,                -- caché: si coincide, no se regenera (D10 §5)
  estado flashcards.estado_mazo NOT NULL DEFAULT 'GENERANDO',
  modelo_usado text,                           -- model id real que respondió
  generado_at timestamptz,
  publicado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tomo_id, version)
);
CREATE UNIQUE INDEX ON flashcards.mazos (tomo_id, contenido_hash);

CREATE TABLE flashcards.tarjetas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mazo_id uuid NOT NULL REFERENCES flashcards.mazos(id) ON DELETE CASCADE,
  orden int NOT NULL,
  anverso text NOT NULL,
  reverso text NOT NULL,
  estado flashcards.estado_tarjeta NOT NULL DEFAULT 'PENDIENTE_REVISION',
  revisada_por uuid,
  revisada_at timestamptz,
  motivo_rechazo text,
  editada boolean NOT NULL DEFAULT false,
  UNIQUE (mazo_id, orden)
);

CREATE TABLE flashcards.repasos (
  usuario_id uuid NOT NULL,
  tarjeta_id uuid NOT NULL REFERENCES flashcards.tarjetas(id) ON DELETE CASCADE,
  visto_at timestamptz NOT NULL DEFAULT now(),
  acerto boolean NOT NULL,
  PRIMARY KEY (usuario_id, tarjeta_id, visto_at)
);
```

**I-8:** la API pública de flashcards filtra `estado = 'PUBLICADA'` **en el repositorio**,
no en el controlador. Un `WHERE` olvidado en un endpoint nuevo no debe poder exponer una
tarjeta sin revisar.

## 9. `payments`

```sql
CREATE TYPE payments.estado_orden AS ENUM
  ('PENDIENTE','APROBADA','CAPTURADA','FALLIDA','EXPIRADA','REEMBOLSADA');

CREATE TABLE payments.ordenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  curso_id uuid NOT NULL,
  monto numeric(12,2) NOT NULL,                -- congelado al crear
  moneda char(3) NOT NULL,
  version_precio int NOT NULL,                 -- del catálogo, para conciliar
  estado payments.estado_orden NOT NULL DEFAULT 'PENDIENTE',
  paypal_order_id text UNIQUE,
  paypal_capture_id text UNIQUE,
  comision numeric(12,2),                      -- lo que PayPal se quedó, al capturar
  neto numeric(12,2),
  expira_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON payments.ordenes (usuario_id, created_at DESC);
CREATE INDEX ON payments.ordenes (estado) WHERE estado = 'PENDIENTE';

-- Proyección de precios (D14): evita llamar a catalog en el camino del checkout.
CREATE TABLE payments.precios_proyeccion (
  curso_id uuid PRIMARY KEY,
  titulo text NOT NULL,
  monto numeric(12,2) NOT NULL,
  moneda char(3) NOT NULL,
  version_precio int NOT NULL,
  publicado boolean NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now()
);

-- Bitácora cruda de webhooks. Se escribe ANTES de procesar y sobrevive al fallo.
CREATE TABLE payments.webhooks_paypal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paypal_event_id text NOT NULL UNIQUE,        -- idempotencia frente a PayPal
  event_type text NOT NULL,
  firma_valida boolean NOT NULL,
  payload jsonb NOT NULL,
  recibido_at timestamptz NOT NULL DEFAULT now(),
  procesado_at timestamptz,
  error text
);
CREATE INDEX ON payments.webhooks_paypal (procesado_at) WHERE procesado_at IS NULL;

CREATE TABLE payments.reembolsos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES payments.ordenes(id),
  paypal_refund_id text NOT NULL UNIQUE,
  monto numeric(12,2) NOT NULL,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

> **Dos claves de idempotencia distintas y las dos hacen falta.**
> `webhooks_paypal.paypal_event_id` protege contra **PayPal** reintentando el webhook.
> `processed_events.event_id` protege contra **SQS** reentregando el mensaje interno. Son
> capas diferentes; quitar una deja un agujero real.

## 10. Regla de no-JOIN entre schemas (D14)

**Prohibido:** `SELECT ... FROM enrollment.matriculas m JOIN catalog.cursos c ON ...`.
Aunque el motor lo permitiera con GRANTs, rompe la frontera y hace imposible mover el
schema después.

**Lo que se hace en su lugar,** por orden de preferencia:

1. **Proyección local alimentada por eventos** — la opción por defecto. Existen dos:
   `enrollment.cursos_proyeccion` y `payments.precios_proyeccion`. Son *read models*: se
   reconstruyen enteros reprocesando eventos, y nunca son la fuente de verdad.
2. **Que el evento traiga el dato** — si `gamification` necesita el título del curso para
   el certificado, `CursoCompletadoEvent` lo trae. Es más barato que cualquier consulta.
3. **Llamada HTTP síncrona a la API pública del otro servicio** — solo fuera del camino
   caliente, solo con timeout y fallback, y **justificada en `DECISIONS.md`**. En Fase 1
   hay exactamente un caso permitido: el panel de admin pidiendo el detalle de un curso a
   `catalog` para mostrarlo junto a las flashcards en revisión.

**Cómo se detecta una violación:** el arch-check (doc 12 §2, regla 5) hace `grep` de
`"<otro_schema>."` en los archivos de `infrastructure/out/persistencia/` de cada servicio y
falla el build si aparece.

## 11. Semillas de `dev`

El módulo `database/` deja `dev` con datos usables, no vacío:

- 1 carrera *Desarrollo Web desde Cero* con 3 cursos: **HTML Esencial** (A-B, $0),
  **CSS desde Cero** (C-E, $19.90), **APIs con Express** (I-J, $29.90).
- Cada curso con 2 tomos × 4 lecciones × 3 bloques.
- 1 banco de nivelación con 20 preguntas etiquetadas A-N.
- 1 banco de evaluación por tomo, 8 preguntas cada uno.
- 2 usuarios: `admin@edtech.test` (grupo `admin`) y `estudiante@edtech.test`.

El seed es **idempotente** (`ON CONFLICT DO NOTHING` con IDs fijos) para poder correrlo
en cada `docker compose up` sin duplicar.
