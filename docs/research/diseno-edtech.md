# Investigación y sistema de diseño de EdTech

**Fecha:** 14 de septiembre de 2026  
**Producto:** EdTech, plataforma para aprender tecnología construyendo y demostrando evidencia  
**Alcance:** experiencia pública, catálogo, autenticación, diagnóstico, aprendizaje, panel del estudiante, administración y contenido de cursos.

## Decisión de diseño

EdTech debe sentirse como un instrumento de trabajo para aprender, no como una página promocional con adornos tecnológicos. La interfaz tiene que responder tres preguntas en todo momento:

1. ¿Dónde estoy dentro de mi ruta?
2. ¿Qué acción de aprendizaje sigue?
3. ¿Qué evidencia demuestra que avancé?

La identidad visual puede ser oscura, técnica y expresiva. El límite es funcional: el código, la consola, el mapa, el color y el movimiento deben explicar estado, nivel o consecuencia. Cuando un elemento sólo decora, compite con la tarea y debe desaparecer o reducirse.

La propuesta mantiene el territorio visual actual —fondo negro azulado, azul eléctrico, amarillo de atención, verde de éxito y tipografía monoespaciada— y lo convierte en un sistema con reglas. El azul describe navegación y actividad técnica; el amarillo señala decisión, nivel o desbloqueo; el verde confirma una evidencia; el rojo se reserva para error o riesgo. No se usa color como único indicador.

## Qué investigué y cómo se interpreta

Separé los hallazgos en tres grupos:

- **Criterio normativo:** accesibilidad y comportamiento verificable, especialmente WCAG 2.2.
- **Evidencia de diseño y aprendizaje:** principios de jerarquía visual, movimiento significativo, carga cognitiva, práctica de recuperación y espaciamiento.
- **Juicio de producto:** decisiones específicas para que EdTech tenga una voz propia y sea operable por una persona que todavía está aprendiendo.

La investigación consultó documentación primaria y material editorial de referencia. Los artículos y videos ayudan a formar criterio, pero no sustituyen pruebas con estudiantes reales. Por eso cada decisión importante queda expresada como una hipótesis que debe probarse con tareas.

## Modelo de usuarios y tareas

### Visitante

El visitante necesita entender qué se aprende, cómo se comprueba y cuál es el siguiente paso para empezar. En la portada, la acción principal es iniciar el diagnóstico o explorar el catálogo. El hero puede presentar “Demuestra tu nivel”, pero debe incluir una respuesta concreta a “¿qué hago ahora?”. El scroll narrativo funciona si cada tramo añade una pieza de comprensión: lenguaje, herramienta, práctica, evidencia.

### Estudiante

El estudiante vuelve para continuar. Su pantalla principal debe priorizar una única acción “Continuar” con contexto: curso, lección, porcentaje y tiempo aproximado. El mapa tipo Duolingo funciona como orientación, siempre que muestre prerequisitos, estado bloqueado, estado disponible, estado completado y una razón visible para desbloquear. Una ruta llena de nodos sin jerarquía se convierte en un índice difícil de leer.

### Administrador y docente

El administrador necesita supervisar estado, localizar problemas y editar contenido. La interfaz administrativa debe preferir tablas, filtros, estados y acciones explícitas. Puede compartir la identidad técnica de EdTech, pero no debe heredar el ritmo narrativo de la portada: aquí la velocidad y la precisión importan más que la sorpresa.

## Jerarquía visual

El análisis de Nielsen Norman Group identifica escala, jerarquía, balance, contraste y principios Gestalt como fundamentos del diseño visual. La jerarquía se construye con tamaño, valor, color, espacio y posición; la proximidad agrupa elementos relacionados y la similitud permite reconocer estados o familias.

Aplicación en EdTech:

- Una pantalla tiene un mensaje principal y una acción primaria.
- El título de una ruta precede al metadato, la descripción y la acción.
- Los números `01`, `02`, `03` sirven como coordenadas de lectura; no reemplazan títulos.
- El texto secundario baja en tamaño y contraste de forma controlada, pero nunca hasta confundirse con texto deshabilitado.
- Los elementos de una misma familia comparten forma, espaciado y tratamiento de estado.
- Las líneas, cuadrículas y terminales sólo aparecen cuando ayudan a explicar estructura o contexto.

La portada actual tiene una ventaja: la terminal y el mapa convierten la abstracción de “aprender programación” en una secuencia visible. El riesgo es que cuatro paneles de scroll parezcan diapositivas. Para evitarlo, el scroll debe ser continuo: la línea de progreso, el cambio de nivel y el contenido deben avanzar mientras la persona mantiene control del desplazamiento.

## Tipografía, lectura y densidad

`Space Grotesk` es adecuada para titulares y navegación porque tiene una geometría técnica sin convertirse en texto de terminal. `JetBrains Mono` debe quedar restringida a código, comandos, identificadores, estados y pequeños metadatos. Un párrafo completo en mono reduce la velocidad de lectura y convierte cada pantalla en una consola.

Reglas propuestas:

- Titulares con pocas palabras, ancho limitado y una diferencia clara frente al cuerpo.
- Cuerpo entre 1rem y 1.1rem en superficies de aprendizaje, con line-height entre 1.5 y 1.7.
- Metadatos monoespaciados entre 0.68rem y 0.8rem, sólo cuando expresen estado o coordenada.
- Código con numeración y resaltado suficiente; el color del token nunca es el único significado.
- Una tarjeta de curso muestra primero nombre, nivel y resultado; la tecnología queda como contexto.
- En móvil se conserva la jerarquía y se reduce la densidad, no sólo el tamaño de todo.

## Color y contraste

Paleta funcional:

| Token         |     Valor | Uso                                           |
| ------------- | --------: | --------------------------------------------- |
| `ink-950`     | `#020911` | fondo principal                               |
| `ink-900`     | `#05090e` | shell y superficies profundas                 |
| `ink-800`     | `#07111d` | paneles y tarjetas                            |
| `cyan-400`    | `#34d9ff` | navegación, foco técnico, ruta activa         |
| `blue-500`    | `#1686ff` | progreso y acción principal                   |
| `yellow-400`  | `#ffd343` | llamada de atención, nivel, desbloqueo        |
| `mint-300`    | `#63f3d1` | éxito y evidencia válida                      |
| `text-strong` | `#eaf3fb` | títulos y datos primarios                     |
| `text-body`   | `#b5c7d6` | lectura secundaria                            |
| `text-muted`  | `#8298ac` | etiquetas de sistema con contraste suficiente |

La escala de color debe comunicar estado de forma consistente. Un curso bloqueado baja su brillo y muestra la condición; un curso disponible usa el azul; un curso completado usa verde y una evidencia concreta. El rojo sólo aparece al explicar un error corregible.

WCAG 2.2 mantiene el contraste mínimo de texto como criterio testable y agrega criterios como foco no oculto, apariencia del foco, tamaño mínimo de objetivo y autenticación accesible. El auditor del proyecto mide señales aproximadas; la revisión final debe incluir contraste real en las combinaciones y evaluación humana con teclado.

## Aprendizaje y arquitectura de contenido

La interfaz debe enseñar a través de la acción. La investigación sobre carga cognitiva recomienda reducir información irrelevante, segmentar y hacer visible la estructura. Los recursos de AERO sobre práctica de recuperación y espaciamiento respaldan alternar explicación breve, recuperación activa, feedback y retorno posterior al concepto.

Estructura recomendada de una lección:

1. **Objetivo observable:** “Escribe una función que devuelva el total”.
2. **Ejemplo trabajado:** código corto con una sola idea nueva.
3. **Predicción:** la persona anticipa la salida antes de ejecutar.
4. **Práctica guiada:** editor con pistas graduadas.
5. **Práctica independiente:** problema similar con menos ayuda.
6. **Feedback accionable:** qué ocurrió, por qué y cuál es el siguiente intento.
7. **Recuperación futura:** la idea reaparece en flashcards, diagnóstico o una lección posterior.

El progreso no debe reducirse a porcentaje. Una barra de `80%` dice cuánto se recorrió, pero no qué se puede hacer. El estado de EdTech debe combinar avance, capacidad demostrada y próxima acción.

## Movimiento, GSAP y scroll

Google describe el movimiento significativo como una forma de comunicar jerarquía, relación y foco. En EdTech, GSAP y ScrollTrigger deben reforzar la explicación:

- La línea del mapa se dibuja para mostrar una ruta y el nodo activo cambia cuando la sección entra en contexto.
- La terminal revela una línea de código cuando esa línea se explica.
- Los niveles aparecen con continuidad para que la persona entienda progresión.
- El movimiento no desplaza controles fuera de la vista ni altera el orden de lectura.
- El scroll sigue siendo controlado por la persona; no se bloquea en paneles ni se convierte en una sucesión de pantallas fijas.
- Cada animación tiene un estado estable equivalente para carga lenta, teclado, lector de pantalla y movimiento reducido.

La media query `prefers-reduced-motion` debe desactivar animaciones ornamentales y conservar sólo cambios necesarios para comunicar estado. MDN identifica esta preferencia como una herramienta para reducir movimiento en personas con trastornos vestibulares, sensibilidad al movimiento, dificultades de atención y dispositivos de menor capacidad.

La implementación actual ya tiene un rail SVG, ScrollTrigger y una regla global de movimiento reducido. El siguiente nivel es medir que el estado reducido no conserve cursores o transiciones perceptibles y que ninguna interacción dependa de haber visto la animación.

## Accesibilidad operable

Requisitos de producto:

- `lang="es"`, título único, un `main` y un `h1` por pantalla.
- Salto al contenido y foco visible con contraste contra el fondo.
- Navegación completa con teclado; el foco no puede quedar debajo del header sticky.
- Controles táctiles y de puntero con al menos 24 × 24 CSS px como mínimo WCAG 2.2; se recomienda un área mayor para acciones primarias móviles.
- Labels persistentes encima de inputs; el placeholder no explica por sí solo el campo.
- Mensajes de error junto al campo, en lenguaje concreto y con sugerencia de corrección.
- Estados bloqueado, cargando, correcto y fallido comunicados por texto y color.
- La autenticación local de desarrollo debe quedar claramente separada de Cognito y jamás aparecer como opción accidental en producción.

## Revisión de la arquitectura actual

La base actual tiene elementos diferenciadores: la marca EdTech está integrada en el header, el lenguaje visual está presente en home, catálogo y autenticación, la portada usa código como contenido y existe una narrativa de niveles. El footer refuerza el concepto de sistema abierto y el catálogo ofrece búsqueda.

Los riesgos a controlar son:

1. **Exceso de metadatos:** códigos, etiquetas, números y estados pueden sumar ruido. Cada uno debe responder una pregunta.
2. **Repetición del scroll:** los paneles deben cambiar de función, no sólo de color y snippet.
3. **Tecnología como disfraz:** una terminal sin acción educativa no aporta comprensión.
4. **Baja legibilidad en etiquetas pequeñas:** las etiquetas de sistema deben ser cortas y conservar contraste.
5. **Diferencia entre usuario invitado y estudiante:** el CTA público y el CTA de continuidad no deben competir.
6. **Admin demasiado expresivo:** el backoffice necesita filtros, densidad y confirmaciones claras.

## Matriz de pantallas

| Pantalla         | Pregunta principal            | Componente dominante               | Evidencia de calidad                      |
| ---------------- | ----------------------------- | ---------------------------------- | ----------------------------------------- |
| Inicio           | ¿Por dónde empiezo?           | hero + ruta de niveles             | CTA único y progresión entendible         |
| Catálogo         | ¿Qué puedo aprender?          | búsqueda + filtros + tarjetas      | comparación rápida y filtros persistentes |
| Detalle de curso | ¿Qué voy a construir?         | resultado, temario y prerequisitos | objetivo y proyecto visibles              |
| Mapa de curso    | ¿Qué sigue?                   | mapa de nodos                      | estado, bloqueo y siguiente acción        |
| Lección          | ¿Qué debo poder hacer?        | objetivo + editor + feedback       | intento ejecutable y feedback accionable  |
| Diagnóstico      | ¿Cuál es mi punto de partida? | preguntas secuenciales             | resultado interpretable y ruta sugerida   |
| Flashcards       | ¿Qué necesito recuperar?      | tarjeta + respuesta + intervalo    | feedback y retorno espaciado              |
| Dashboard        | ¿Qué continúo hoy?            | próxima acción + evidencia         | continuidad en un clic                    |
| Login/Register   | ¿Cómo entro?                  | formulario corto                   | labels, errores y modo claro              |
| Admin            | ¿Qué debo resolver?           | tabla, filtros y estados           | acción localizada y confirmación          |
| Certificado      | ¿Qué puedo demostrar?         | evidencia verificable              | identidad, habilidades y enlace público   |

## Plan de implementación

### Fase 1: base medible

Mantener el sistema de tokens y añadir estados accesibles para foco, error, bloqueado y éxito. Ejecutar el auditor en las rutas públicas y de autenticación para detectar status HTTP, errores de navegador, overflow, landmarks, nombres accesibles, targets y contraste aproximado.

### Fase 2: comprensión de la portada

Reducir el hero a una promesa, una acción y una muestra de código. Hacer que cada tramo del scroll represente una capacidad distinta: sintaxis, herramientas, harness y evidencia. La línea del mundo debe funcionar como mapa de orientación y también como navegación accesible por títulos.

### Fase 3: continuidad de aprendizaje

Revisar el mapa de curso y el dashboard alrededor de “continuar”. Agregar objetivos observables y feedback de recuperación. El mapa debe explicar el desbloqueo; la gamificación debe mostrar competencia o evidencia, no sólo puntos.

### Fase 4: operaciones y contenido

Dar al admin un layout de trabajo con tablas, filtros y estados. Compartir tokens de marca, pero reducir animaciones y ornamentación. Verificar que cualquier modificación de contenido se pueda localizar, editar, publicar y auditar.

### Fase 5: pruebas con personas

Medir tareas, no opiniones generales:

- Visitante: encontrar un curso Python inicial e iniciar registro.
- Estudiante: continuar la siguiente lección y reconocer por qué está desbloqueada.
- Estudiante: completar un ejercicio y explicar qué significa el feedback.
- Administrador: localizar un curso publicado y cambiar su estado.
- Todas las personas: completar login, navegación y una acción principal con teclado.

Registrar tiempo, errores, abandonos, preguntas de orientación y comprensión del estado. Una estética atractiva no compensa que una persona no sepa qué hacer después.

## Auditor creado para EdTech

`tools/design-auditor.mjs` recorre ocho rutas en tres viewports. Genera capturas y `report.json` en `/tmp/edtech-design-audit`. Revisa status HTTP, errores de página, peticiones fallidas, overflow horizontal, título, idioma, landmarks, h1, nombres accesibles, objetivos pequeños, contraste aproximado, enlaces, animación visible y `prefers-reduced-motion`.

El script distingue enlaces de texto continuo de controles y navegación discreta para evitar falsos positivos. También abre una segunda sesión con movimiento reducido y exige que el resultado no conserve animaciones perceptibles. No pretende reemplazar axe, contraste manual, lector de pantalla ni pruebas con estudiantes; funciona como alarma rápida para cada iteración visual.

Comando:

```bash
node tools/design-auditor.mjs
```

El comando usa el `playwright-core` y Chromium del harness Anrrous en WSL; la aplicación sigue instalándose y ejecutándose con Bun del lado Windows según la ficha del proyecto. También queda disponible como `bun run design:audit` cuando el script se lanza desde ese entorno WSL.

## Fuentes consultadas

- [W3C, Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/): criterios de contraste, foco, targets, autenticación y principios de accesibilidad.
- [W3C, novedades de WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/): foco no oculto, tamaño mínimo y autenticación accesible.
- [Google Design, Motion Design: Make Interfaces Meaningful](https://design.google/library/making-motion-meaningful): movimiento para jerarquía, foco y comprensión.
- [Material Design 3](https://m3.material.io/): sistema de tokens, tipografía, color, componentes adaptables y estados.
- [NN/G, 5 Principles of Visual Design in UX](https://www.nngroup.com/articles/principles-visual-design/): escala, jerarquía, balance, contraste y Gestalt.
- [NN/G, Visual Hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/): mecanismos de jerarquía visual y orden de atención.
- [MDN, Using media queries for accessibility](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Using_for_accessibility): uso de `prefers-reduced-motion`.
- [Baymard, Form Design](https://baymard.com/learn/form-design): labels persistentes, required/optional y prevención de errores en formularios.
- [AERO, Spacing and retrieval practice guide](https://www.edresearch.edu.au/guides-resources/practice-guides/spacing-and-retrieval-practice-guide-full-publication): práctica de recuperación y espaciamiento.
- [University of Minnesota, Spaced and interleaved practice improves recall](https://cei.umn.edu/teaching-resources/leveraging-learning-sciences/spaced-and-interleaved-practice-improves-recall): aplicación de espaciamiento e intercalado.
- [Learning Scientists, spacing and retrieval practice](https://www.learningscientists.org/learning-scientists-podcast/2018/3/7/episode-14-how-students-can-use-spacing-and-retrieval-practice): explicación para estudiantes y docentes.
- [Google I/O, Material principles](https://www.youtube.com/watch?v=isYZXwaP3Q4): video sobre principios de Material.
- [Google I/O, Material motion guidelines](https://www.youtube.com/watch?v=6p3i6H2oGa0): video sobre movimiento en interfaces.

Este documento separa evidencia de recomendación. Las decisiones específicas de EdTech son hipótesis de diseño y deben validarse con tareas y estudiantes reales antes de convertirlas en reglas definitivas.
