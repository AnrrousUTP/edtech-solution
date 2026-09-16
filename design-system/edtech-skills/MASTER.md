# Google Skill Diseño EdTech — Master

> Fuente de verdad visual del proyecto. Reinterpreta Google Skills para una
> plataforma EdTech propia; no copia logos, wordmarks, imágenes ni activos de
> Google y no afirma afiliación.

## Dirección visual

- Producto: plataforma de aprendizaje práctico, progreso y credenciales.
- Estilo: editorial, claro, confiable y con momentos cromáticos de energía.
- Superficies: blanco y azul-gris muy suave; negro únicamente en secciones de énfasis.
- Header: blanco, 64px, sin borde visible ni sombra pesada.
- Forma: paneles grandes redondeados, búsqueda y chips en formato píldora.
- Interacción: cambios de color, fondo, borde u opacidad; sin transforms que muevan el layout.

## Tokens

| Rol              | Token                 | Valor     |
| ---------------- | --------------------- | --------- |
| Superficie       | `--gs-surface`        | `#FFFFFF` |
| Fondo de trabajo | `--gs-surface-alt`    | `#F0F4F9` |
| Superficie suave | `--gs-surface-soft`   | `#F8FAFD` |
| Buscador         | `--gs-search-surface` | `#E9EEF6` |
| Texto principal  | `--gs-ink`            | `#1F1F1F` |
| Texto de lectura | `--gs-body`           | `#444746` |
| Texto secundario | `--gs-muted`          | `#5F6368` |
| Borde            | `--gs-border`         | `#DADCE0` |
| Borde fuerte     | `--gs-border-strong`  | `#C4C7C5` |
| Énfasis oscuro   | `--gs-black`          | `#060606` |
| Primario         | `--gs-primary`        | `#0B57D0` |
| Azul brillante   | `--gs-primary-bright` | `#1A73E8` |
| Azul decorativo  | `--gs-primary-google` | `#4285F4` |
| Verde positivo   | `--gs-green`          | `#0F9D58` |
| Verde activo     | `--gs-green-bright`   | `#34A853` |
| Amarillo logro   | `--gs-yellow`         | `#F4B400` |
| Rojo error       | `--gs-red`            | `#DB4437` |
| Morado categoría | `--gs-purple`         | `#8E65D8` |

Los colores de categoría deben acompañarse de texto o icono: juegos `#E52592`,
aula `#01877E`, curso externo `#D56E0C`, certificación `#C5221F`.

## Tipografía

El proyecto usa `Space Grotesk` mediante `--fuente-display` como aproximación
local a Google Sans y `JetBrains Mono` mediante `--fuente-mono` para código y
metadatos técnicos.

- Display grande: `clamp(3rem, 7vw, 3.5625rem)`, line-height `1.12`, peso 500.
- Título de sección: `2.8rem` aproximado, line-height `1.05`, peso 500.
- Headline: `1.5rem / 2rem`, peso 400.
- Título de tarjeta: `1.375rem / 1.75rem`, peso 500.
- Cuerpo: `1rem / 1.5rem`, peso 400.
- UI: `0.875rem / 1.25rem`, peso 400–600.
- Metadatos: `0.75rem / 1rem`; no usar mayúsculas para párrafos.

## Geometría y layout

- Ritmo base: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 80 / 128px`.
- Ancho de contenido: máximo aproximado de `1200px`.
- Gutters móviles: `16–24px`; desktop: `32px` cuando el contexto lo permita.
- Header: `64px`.
- Search: `56px`, radius `28px`, padding horizontal `24px`.
- Botones: mínimo `44px` de área de interacción, radius `999px`.
- Chips: alrededor de `34px`, padding horizontal `16px`, radius `40px`.
- Campos: alrededor de `56px`, borde `1px`, radius `4–12px`, padding `8px 16px`.
- Paneles principales: radius `28–32px`; tarjetas: `16–28px`.

## Componentes

### Header

Wordmark EdTech propio a la izquierda, navegación compacta, búsqueda con SVG
accesible, cuenta/progreso cuando corresponda y un CTA azul de alto contraste.

### Landing y descubrimiento

Hero con título amplio, explicación breve, buscador de 56px y sugerencias. Las
formas decorativas multicolor deben estar detrás del contenido y nunca reducir
contraste. Mantener la identidad EdTech.

### Catálogo

Título, descripción, búsqueda, filtros con scroll horizontal intencional en
móvil, contador y grid responsive. Tarjetas blancas, metadata breve, título
claro, CTA direccional con SVG.

### Dashboard y aprendizaje

Paneles blancos sobre `--gs-surface-alt`, rails horizontales solo cuando sean
intencionales, progreso con texto e icono además de color y estados vacíos
calmos.

### Credenciales

Título sobrio, descripción, tabs con texto y underline visible, superficie
informativa azul y badges con etiqueta explícita.

### Cuenta, auth y admin

Labels visibles, campos altos outlined, helpers y errores junto al campo,
acción primaria única y tarjetas blancas. Tablas dentro de contenedores con
overflow propio; nunca provocar scroll horizontal en la página.

## Iconografía

Usar una familia SVG local, geométrica y consistente: stroke 1.8–2px, tamaños
20–24px para controles y 24–32px para categorías. Iconos decorativos llevan
`aria-hidden="true"`; controles solo-icono tienen `aria-label`. No usar emoji,
flechas Unicode, glifos de texto ni librerías visualmente inconsistentes.

## Accesibilidad y responsive

- Contraste mínimo 4.5:1 para texto normal.
- Focus visible de 2–3px con offset suficiente.
- Targets táctiles de al menos 44×44px y separación mínima de 8px.
- Orden de tabulación igual al orden visual.
- Errores inline con `role="alert"` cuando aplique.
- `prefers-reduced-motion` respetado.
- Verificar 375px, 768px, 1024px y 1440px.
- Los únicos scroll horizontales permitidos son rails de tarjetas y filtros intencionales.

## Anti-patrones

- Bordes o sombras pesadas en el header.
- Texto gris de bajo contraste sobre fondos claros.
- Hover que desplaza o escala elementos.
- Color como único indicador de estado.
- Emojis o caracteres Unicode usados como iconos.
- Inputs sin label visible.
- Diseño dark-tech residual fuera de una sección de énfasis deliberada.

## Checklist de entrega

- [ ] Tokens compartidos antes que hexadecimales locales.
- [ ] Header borderless y legible.
- [ ] Landing, catálogo, dashboard, aprendizaje, auth y admin revisados.
- [ ] Iconos SVG locales con nombres accesibles.
- [ ] Sin overflow accidental en móvil.
- [ ] Focus, reduced-motion y estados disabled verificados.
- [ ] Build de Next.js y TypeScript correctos.
