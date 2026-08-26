# 02 — Dominio, niveles y bounded contexts

## 1. Jerarquía de contenido

```
Carrera  ──┬── Curso ──┬── Tomo (nivel) ──┬── Lección ──┬── Bloque de contenido
           │           │                  │             └── Ejercicio
           │           │                  └── Evaluación de tomo
           │           └── (1..n tomos)
           └── (3..8 cursos)     → certificado mayor al completar la carrera
                       └── certificado menor + insignia al completar el curso
```

Reglas de negocio:

- Un **curso de un solo tomo** se dimensiona para completarse en ~4 semanas de estudio
  ligero (≈ 12 lecciones, ≈ 20 ejercicios, 1 evaluación).
- Una **carrera** es un ordenamiento de cursos con prerrequisitos. Completar todos los
  cursos de la carrera emite el **certificado mayor**.
- Un **tomo** se completa cuando todas sus lecciones están completadas **y** su evaluación
  se aprueba con ≥ 70 %.
- Un **curso** se completa cuando todos sus tomos están completados → emite
  **insignia + certificado menor**.
- El catálogo inicial cubre **HTML, CSS y Express**, agrupados en la carrera
  *"Desarrollo Web desde Cero"*.

## 2. Escala de niveles A-N (D11)

El mega-prompt dejaba la escala "a definir". Queda fijada así: **14 niveles (A-N)
agrupados en 4 tramos**. El tramo es lo que ve el estudiante; la letra es lo que usa el
motor de recomendación.

| Tramo | Niveles | Qué significa | Ejemplo de curso |
|---|---|---|---|
| **Fundamentos** | A · B · C · D | No ha escrito código nunca o solo copió snippets | HTML Esencial (A-B), CSS Esencial (C-D) |
| **Intermedio** | E · F · G · H | Construye páginas completas, entiende el modelo de caja y el DOM | CSS Layout (E-F), JavaScript del navegador (G-H) |
| **Avanzado** | I · J · K | Programa del lado servidor, entiende HTTP y persistencia | Express y APIs REST (I-J), Bases de datos (K) |
| **Profesional** | L · M · N | Arquitectura, pruebas, despliegue | Testing y CI (L), Arquitectura de aplicaciones (M-N) |

**Cómo se asigna el nivel.** El test de nivelación son 20 preguntas de dificultad creciente
etiquetadas con su nivel A-N. El nivel asignado es **el nivel más alto en el que el
estudiante acertó ≥ 60 % de las preguntas de ese nivel y de todos los anteriores**. Si no
alcanza el umbral en ningún nivel → **A**. El estudiante puede **saltar el test** y elegir
tramo manualmente; queda registrado como `origen_nivel = AUTODECLARADO`, que el dashboard
del admin distingue de `TEST`.

**Regla de no-castigo.** El nivel nunca baja automáticamente. Solo sube: al completar un
curso, el nivel del estudiante pasa a `max(nivel_actual, nivel_max_del_curso)`.

## 3. Flujo del estudiante

```
Landing → Catálogo
   ├─ (opcional) Test de nivelación → nivel A-N asignado
   ├─ Selección de curso (recomendado por nivel, o libre)
   ├─ Checkout PayPal ──→ pago confirmado ──→ matrícula habilitada
   └─ Dentro del curso, por tomo:
        Conocimientos previos (diagnóstico corto, no bloquea)
          → Contenido de lecciones (texto, código, video)
          → Ejercicios prácticos
          → Evaluación del tomo (≥70%)
          → Tomo completado
      Al completar todos los tomos:
        → Insignia + certificado menor  (gamification)
        → Flashcards de repaso disponibles (flashcards, ya aprobadas)
      Al completar todos los cursos de la carrera:
        → Certificado mayor
```

Fuera del curso, siempre disponible: **dashboard** con racha, insignias, certificados,
progreso por curso, y el **panel de flashcards** de repaso de lo ya cursado.

## 4. Vistas de usuario

| Rol (grupo Cognito) | Puede |
|---|---|
| `estudiante` | Ver catálogo, hacer el test, comprar, consumir cursos, hacer evaluaciones, ver su progreso, insignias y certificados, repasar con flashcards |
| `admin` | Todo lo del estudiante + crear/editar/publicar carreras, cursos, tomos, lecciones y bancos de preguntas · fijar precios · **aprobar, editar o rechazar flashcards generadas por IA** · ver métricas de matrícula y pagos |

No hay rol "instructor" en Fase 1: el admin es el cliente que gestiona su propio catálogo.

## 5. Los seis bounded contexts

### 5.1 `identity-access-service`

- **Le pertenece:** perfil del estudiante (nombre visible, avatar, país, idioma),
  rol de dominio, preferencias, nivel A-N vigente y su origen.
- **NO le pertenece:** contraseñas, tokens, MFA (eso es Cognito, D2); el progreso en
  cursos (es de enrollment); las insignias (son de gamification).
- **Agregado raíz:** `Usuario` (`id` = `sub` de Cognito).
- **Invariantes:** el `sub` es inmutable · el nivel solo sube (§2) · un usuario tiene
  exactamente un rol de dominio.
- **Publica:** `UsuarioRegistradoEvent`, `NivelUsuarioActualizadoEvent`,
  `PerfilActualizadoEvent`.
- **Consume:** `CursoCompletadoEvent` (para subir el nivel).

### 5.2 `catalog-service`

- **Le pertenece:** carreras, cursos, tomos, lecciones, bloques de contenido, ejercicios,
  **bancos de preguntas** (del test de nivelación y de las evaluaciones de tomo), precios,
  estado de publicación.
- **NO le pertenece:** quién está matriculado, quién respondió qué, cuánto pagó nadie.
- **Agregado raíz:** `Curso` (contiene tomos y lecciones). `Carrera` y `BancoDePreguntas`
  son agregados aparte.
- **Invariantes:** un curso no se publica sin al menos un tomo con al menos una lección ·
  un curso publicado no cambia de precio sin dejar rastro de versión · el orden de tomos y
  lecciones es contiguo y sin huecos · las respuestas correctas del banco **nunca** salen
  en la API pública de contenido.
- **Publica:** `CursoPublicadoEvent`, `CursoDespublicadoEvent`,
  `ContenidoCursoActualizadoEvent`, `PrecioCursoActualizadoEvent`.
- **Consume:** nada. Es el contexto río arriba.

### 5.3 `enrollment-progress-service`

Absorbe **Assessment** (H3/D3): el intento de evaluación y el avance que provoca son la
misma transacción.

- **Le pertenece:** matrícula (quién tiene acceso a qué curso y hasta cuándo), progreso por
  lección/tomo/curso, intentos de evaluación con sus respuestas y su puntaje, resultado del
  test de nivelación.
- **NO le pertenece:** el contenido de las lecciones ni el texto de las preguntas (los pide
  a catalog, o los tiene proyectados) · la insignia que se otorga al completar · el cobro.
- **Agregados raíz:** `Matricula`, `IntentoEvaluacion`.
- **Invariantes:** no hay progreso sin matrícula activa · una lección no se marca completada
  dos veces (idempotente) · un intento de evaluación es inmutable una vez entregado ·
  el tomo se completa **solo** si todas sus lecciones están completas y la evaluación
  aprobada · la matrícula solo se habilita por `PagoConfirmadoEvent` o por alta manual del
  admin (cursos gratuitos), nunca por una llamada del frontend.
- **Publica:** `MatriculaCreadaEvent`, `LeccionCompletadaEvent`, `TomoCompletadoEvent`,
  `CursoCompletadoEvent`, `CarreraCompletadaEvent`, `EvaluacionAprobadaEvent`,
  `EvaluacionReprobadaEvent`, `TestNivelacionCompletadoEvent`.
- **Consume:** `PagoConfirmadoEvent` (habilita), `PagoReembolsadoEvent` (revoca),
  `CursoPublicadoEvent` / `ContenidoCursoActualizadoEvent` (mantiene su proyección de
  estructura de curso, D14), `CursoDespublicadoEvent` (no revoca acceso ya comprado —
  solo impide matrículas nuevas).

### 5.4 `gamification-service`

- **Le pertenece:** insignias otorgadas, certificados emitidos (menor y mayor), puntos,
  racha diaria, tabla de posiciones.
- **NO le pertenece:** el progreso que las origina · el contenido · el pago.
- **Agregado raíz:** `PerfilGamificacion` (por usuario). `Certificado` es agregado aparte
  porque tiene ciclo de vida y verificación pública propios.
- **Invariantes:** una insignia se otorga **una sola vez** por (usuario, criterio) · un
  certificado emitido es inmutable y tiene un `codigo_verificacion` público único · la
  racha se rompe si pasan más de 48 h sin actividad (ventana de gracia de un día).
- **Publica:** `InsigniaOtorgadaEvent`, `CertificadoEmitidoEvent`, `RachaRotaEvent`,
  `RachaExtendidaEvent`.
- **Consume:** `TomoCompletadoEvent`, `CursoCompletadoEvent`, `CarreraCompletadaEvent`,
  `LeccionCompletadaEvent` (para racha y puntos).

### 5.5 `flashcards-service`

- **Le pertenece:** mazos de flashcards por tomo, cada tarjeta con su estado
  (`pendiente_revision` → `publicada` | `rechazada`), historial de revisión, y el registro
  de repaso del estudiante (qué tarjeta vio, cuándo, si acertó).
- **NO le pertenece:** el contenido fuente (es de catalog) · el modelo de IA (está detrás
  de `GeneradorFlashcardsPort`) · quién tiene acceso al curso (pregunta a enrollment o lo
  proyecta).
- **Agregado raíz:** `MazoFlashcards`.
- **Invariantes:** ninguna tarjeta llega al estudiante sin pasar por `publicada` (HITL, sin
  excepción ni bypass de admin en caliente) · una regeneración no borra tarjetas ya
  publicadas: crea una versión nueva del mazo y la deja en revisión · el hash del contenido
  fuente decide si hace falta regenerar (caché, doc 10 §5).
- **Publica:** `MazoGeneradoEvent`, `MazoPublicadoEvent`, `TarjetaRechazadaEvent`.
- **Consume:** `ContenidoCursoActualizadoEvent` (dispara generación).

### 5.6 `payments-service`

- **Le pertenece:** órdenes, capturas, reembolsos, eventos de webhook procesados,
  conciliación con PayPal.
- **NO le pertenece:** el precio de catálogo (lo pide a catalog al crear la orden y lo
  **congela** en la orden) · la matrícula que el pago habilita.
- **Agregado raíz:** `Orden`.
- **Invariantes:** el monto de una orden se congela al crearla y no cambia · un webhook con
  firma inválida **nunca** se procesa · un `event_id` de PayPal se procesa una sola vez ·
  `PagoConfirmadoEvent` se emite **solo después** de que la captura esté confirmada por
  PayPal, nunca al recibir el webhook · una orden en `PENDIENTE` más de 24 h expira.
- **Publica:** `OrdenCreadaEvent`, `PagoConfirmadoEvent`, `PagoFallidoEvent`,
  `PagoReembolsadoEvent`.
- **Consume:** `PrecioCursoActualizadoEvent` (mantiene su proyección de precios vigentes,
  D14 — evita una llamada síncrona a catalog en el camino del checkout).

## 6. Mapa de contextos

```
                        catalog-service
                       (upstream puro)
                              │
        ContenidoCursoActualizado / CursoPublicado / PrecioCursoActualizado
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
      flashcards-svc   enrollment-progress   payments-svc
              │               ▲                │
              │               └── PagoConfirmado / PagoReembolsado
              │               │
              │      TomoCompletado / CursoCompletado / LeccionCompletada
              │               ▼
              │        gamification-svc
              │               │
              └──────────┐    │  InsigniaOtorgada / CertificadoEmitido
                         ▼    ▼
                    cola SQS `notifications` → SES

      identity-access-service ◄── CursoCompletado (sube nivel)
                              ──► UsuarioRegistrado (todos lo pueden proyectar)
```

Relación entre contextos, en lenguaje de DDD:

- `catalog` → todos: **Publisher/Subscriber**. Catalog no sabe quién lo escucha.
- `payments` → `enrollment`: **Customer/Supplier**. Enrollment depende de un contrato de
  evento que payments no puede cambiar sin aviso (lo protege el contract test, doc 12 §5).
- `enrollment` → `gamification`: **Publisher/Subscriber**. Gamification decide qué premia.
- Cognito → `identity-access`: **Conformist**. El servicio se adapta al shape de Cognito,
  no al revés.

## 7. Qué está explícitamente prohibido entre contextos

1. `gamification` **no** consulta el progreso de enrollment por HTTP para decidir si otorga
   una insignia. El evento trae todo lo que necesita.
2. `enrollment` **no** hace JOIN contra el schema de catalog para armar el árbol del curso.
   Mantiene su proyección (D14).
3. `flashcards` **no** lee lecciones de la base de catalog. El evento
   `ContenidoCursoActualizadoEvent` trae el contenido (o una URL S3 firmada a él).
4. `payments` **no** crea matrículas. Emite el evento y se desentiende.
5. Ningún servicio lee ni escribe la tabla `processed_events` de otro.
