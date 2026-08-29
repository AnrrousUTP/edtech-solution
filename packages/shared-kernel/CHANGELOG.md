# Changelog — @edtech/shared-kernel

## 0.1.0 — 2026-08-28

Alcance inicial (doc 06 §3.1, excepciones autorizadas desde el día uno):

- `Result` (`Ok`/`Err`) — patrón de resultado de `application/`.
- `DomainEvent` + `AggregateRoot` con `pullEvents()`.
- `IEventPublisher` (port compartido).
- `UniqueId` (VO).
- Cursor de paginación opaco.
- `CommandBus` / `QueryBus`.
- Cliente/publisher de EventBridge (sobre del doc 05 §3).
- Poller SQS genérico con `parseSobre`.
- Lector de Secrets Manager con caché.
- Middlewares HTTP: contexto de request (correlationId), errores, auth (JWT de Cognito).
- Logger estructurado JSON.
- Schemas JSON de los 26 eventos del doc 05 §2 + `validarContra` (contract tests).
- Dobles de test: `InMemoryEventPublisher`, `FakeClock`.

Ver `docs/adr/0001-alcance-inicial-kernel.md`.
