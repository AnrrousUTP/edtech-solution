# ADR 0001 — Alcance inicial del shared-kernel

**Fecha:** 2026-08-28 · **Estado:** aceptado

## Contexto

La regla de los tres usos (doc 06 §3.1) exige que nada entre al kernel salvo que lo usen
3+ servicios. El doc autoriza una lista inicial; este ADR la registra y justifica las
piezas que el doc menciona fuera de esa lista.

## Decisión

Entran las 11 piezas de la lista del doc 06 §3.1, más:

- **`auth.middleware.ts`** — el doc 08 §5 lo ubica explícitamente en el kernel; lo usan
  los 6 servicios.
- **`logger.ts`** — el lint de convenciones (doc 12 §3) prohíbe `console.log` y remite al
  "logger estructurado del kernel"; lo usan los 6 servicios.
- **`events/schemas/*.json` + `validador.ts`** — el doc 06 §3.2 declara los schemas JSON
  como lo único compartible de los eventos; el validador es lo que usan los contract
  tests de los 6 servicios (doc 12 §5).
- **`request-context.ts`** — el `correlationId` debe propagarse en los 6 servicios
  (doc 05 §3).

## Consecuencias

Cualquier adición posterior requiere su propio ADR con la justificación de los tres usos.
No entran al kernel: entidades de dominio, tipos de payload de eventos, acceso a BD,
lógica de negocio (doc 06 §3.2).
