# 11 — Frontend (Next.js)

## 1. Stack

- **Next.js (App Router)** + TypeScript, corriendo con **Bun**.
- **Server Components por defecto.** `'use client'` solo donde hay estado o eventos: el
  reproductor, el composer de evaluaciones, el panel de flashcards, el checkout.
- **Tailwind CSS** con tokens propios (§3). Sin librería de componentes pesada: los
  componentes de este producto (mapa de niveles, barra de racha, tarjeta volteable) son
  específicos y una librería genérica solo estorba.
- **Zod** para validar lo que entra y lo que sale de las APIs.
- **TanStack Query** solo en las pantallas cliente con polling (checkout, generación de
  flashcards). El resto se resuelve con `fetch` en Server Components y revalidación.
- Despliegue: **build estático + SSR en el mismo contenedor ECS**, servido por CloudFront.
  No se usa Vercel: todo el stack es AWS y meter otro proveedor por comodidad agrega otra
  factura, otro dominio y otro punto de fallo.

## 2. Pantallas

| # | Ruta | Qué hace | Auth |
|---|---|---|---|
| 1 | `/` | Landing: propuesta, carreras destacadas, CTA al test | Público |
| 2 | `/cursos` | Catálogo con filtro por tecnología, nivel y precio | Público |
| 3 | `/cursos/[slug]` | Detalle: temario, duración, precio, botón comprar/continuar | Público |
| 4 | `/nivelacion` | Test de nivelación: 20 preguntas, una por pantalla, resultado con el tramo asignado | Estudiante |
| 5 | `/aprender/[cursoSlug]` | Mapa del curso: tomos y lecciones con su estado (bloqueada / disponible / completada) | Estudiante + matrícula |
| 6 | `/aprender/[cursoSlug]/[leccionId]` | Reproductor: bloques de contenido, ejercicios, botón "Completar lección" | Estudiante + matrícula |
| 7 | `/aprender/[cursoSlug]/[tomoId]/evaluacion` | Evaluación del tomo con resultado y desglose | Estudiante + matrícula |
| 8 | `/repasar/[tomoId]` | Flashcards: tarjeta volteable, "lo sabía / no lo sabía" | Estudiante + matrícula |
| 9 | `/checkout/[cursoSlug]` | Botón de PayPal, estado del pago, espera de habilitación (doc 09 §2) | Estudiante |
| 10 | `/dashboard` | Racha, puntos, insignias, certificados, cursos en progreso | Estudiante |
| 11 | `/certificados/[codigo]` | Verificación pública de un certificado | Público |
| 12 | `/admin` | Panel: cursos, tomos, lecciones, precios, publicación | Admin |
| 13 | `/admin/flashcards` | Cola de revisión HITL: aprobar / editar / rechazar | Admin |
| 14 | `/admin/metricas` | Matrículas, ingresos (bruto / comisión / neto), cursos más vendidos | Admin |

## 3. Lenguaje visual

Inspirado en la progresión gamificada de Duolingo y en la seriedad curricular de Google
Skills, **sin copiar assets, iconografía ni marca de ninguno de los dos**.

**Tokens** (`tailwind.config.ts`):

```
Marca:      indigo-600  #4F46E5   — acciones primarias, progreso
Acento:     amber-400   #FBBF24   — rachas, insignias, celebración
Éxito:      emerald-500 #10B981   — completado, aprobado
Alerta:     rose-500    #F43F5E   — reprobado, error
Neutros:    slate-50 … slate-900
Tipografía: Nunito (redondeada, amigable) para UI · JetBrains Mono para código
Radios:     lg = 12px, xl = 16px  (todo redondeado, nada de esquinas duras)
Sombras:    suaves y de baja opacidad; nunca sombras que "levanten" al pasar el cursor
```

**Restricción de interacción (D19), y es firme:**

> **Sin efectos hover con movimiento. Sin `transform`, `translate` ni `scale` en hover.**
> El feedback de hover se hace con **color de fondo, color de borde y opacidad**, nunca
> moviendo el elemento. Aplica a botones, tarjetas de curso, nodos del mapa de niveles y
> flashcards.

```css
/* correcto */
.tarjeta-curso        { background: var(--slate-50);  border-color: var(--slate-200); }
.tarjeta-curso:hover  { background: var(--slate-100); border-color: var(--indigo-400); }

/* prohibido */
.tarjeta-curso:hover  { transform: translateY(-4px) scale(1.02); }
```

La regla no aplica a **transiciones de entrada** (una tarjeta que aparece, un modal que se
abre) ni a las micro-celebraciones (§4), que son eventos puntuales y no respuesta al
puntero. Y todo lo animado respeta `prefers-reduced-motion`.

## 4. Gamificación en la interfaz

- **Mapa de niveles**: los tomos en una ruta vertical, con estado visible (bloqueado /
  disponible / completado). El nodo actual se distingue por color y borde, no por rebote.
- **Barra de progreso** por tomo y por curso, siempre visible en el reproductor.
- **Racha**: contador con llama en la barra superior. Al extenderse, cambia de color; a los
  7, 30 y 100 días, celebración (§4).
- **Micro-celebraciones**: al completar un tomo o ganar una insignia, un overlay breve
  (≈1,5 s) con la insignia y confeti ligero, cerrable con un clic. Es una animación de
  evento, no de hover — permitida. Con `prefers-reduced-motion`, se muestra estático.
- **Insignias** en el dashboard, en cuadrícula, con las no obtenidas en gris y su criterio
  visible: saber qué falta motiva más que ver un hueco.
- **Certificado**: vista previa del PDF + enlace público de verificación.

## 5. Consumo de APIs

- Cada servicio expone su propia base (`/api/catalog`, `/api/enrollment`, …) a través del
  ALB (doc 07 §5). El frontend **nunca** conoce colas, eventos ni el bus.
- En Server Components, `fetch` con el `Authorization: Bearer` leído de la cookie httpOnly
  (doc 08 §7). El access token nunca llega al navegador.
- Un cliente tipado por servicio en `apps/web/src/api/<servicio>.ts`, con las respuestas
  validadas por Zod. Si un servicio cambia su contrato sin avisar, falla en el cliente con
  un mensaje claro en vez de romper con `undefined` tres componentes más abajo.
- **Estados de carga y error de verdad**, no un spinner genérico: skeletons con la forma
  del contenido, y errores con acción ("Reintentar", "Volver al catálogo").
- **Consistencia eventual, dicha con honestidad** (doc 09 §2): tras pagar, "Confirmando tu
  pago…"; tras generar flashcards, "Tus tarjetas están en revisión". Nunca una barra de
  progreso falsa ni un error donde solo hubo demora.

## 6. Accesibilidad

No es opcional y es barato hacerlo desde el principio:

- Contraste AA en todo texto (los tokens de §3 están elegidos para cumplirlo).
- Navegación completa por teclado: el test, el reproductor y las flashcards se usan sin
  ratón (`espacio` voltea la tarjeta, `1`/`2` responde).
- `prefers-reduced-motion` desactiva confeti y transiciones.
- Etiquetas y roles ARIA en el mapa de niveles (que es una lista, no una decoración).
- El código de las lecciones va en `<pre><code>` con `lang`, no en imágenes.

## 7. Preparación para móvil (D7)

Flutter queda fuera de Fase 1, pero la API **no puede quedar atada al navegador**. Cuatro
condiciones que se cumplen desde ahora y que se verifican en la aceptación:

1. **Toda la funcionalidad está en la API HTTP.** Ninguna regla vive solo en el frontend.
   El progreso, el puntaje y el nivel los calcula el servidor; el cliente muestra.
2. **Auth con Bearer token, no con cookies de sesión.** Las cookies httpOnly son una
   comodidad del navegador (doc 08 §7); la API acepta `Authorization: Bearer` y el flujo
   PKCE de Cognito funciona igual desde una app nativa.
3. **`openapi.yaml` por servicio, mantenido.** Es lo que le permite a un cliente Flutter
   generar su capa de datos sin leer el código del backend.
4. **Sin HTML en las respuestas.** El contenido de las lecciones viaja como **Markdown y
   bloques estructurados** (doc 03 §5, `bloques.contenido` es JSONB), no como HTML
   renderizado. Un `<div>` en la respuesta es lo que obliga a meter un WebView en la app
   móvil y arruina la experiencia nativa.

Lo que **sí** faltará cuando llegue Flutter, y queda anotado como deuda (doc 15): push
notifications (SNS/Pinpoint), descarga de lecciones para uso sin conexión, y compras dentro
de la app —que en iOS y Android tienen sus propias reglas de comisión y no pasan por PayPal.
