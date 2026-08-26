# 04 — Arquitectura hexagonal: el estándar, hecho código

> El mega-prompt §4 describe el estándar en prosa. Acá está en TypeScript real, para que
> Fable copie en vez de interpretar. **Lo de este documento no es negociable**: el harness
> (doc 12) falla el build de cualquier servicio que se salga.

## 1. La regla de dependencia

```
        infrastructure/  ──depende de──►  application/  ──depende de──►  domain/
              │                                                            ▲
              └────────────── implementa los ports-out ────────────────────┘
```

`domain/` **no importa nada** fuera de sí mismo y del shared-kernel. Ni Express, ni
Drizzle, ni el AWS SDK, ni `bun:sqlite`, ni una librería de fechas con side effects.
Si el dominio necesita saber la hora, la recibe; no la pide.

| Capa | Puede importar | Nunca importa |
|---|---|---|
| `domain/` | shared-kernel, otras cosas de `domain/` | todo lo demás |
| `application/` | `domain/`, shared-kernel | Express, `Request`/`Response`, Drizzle, AWS SDK |
| `infrastructure/` | todo | código de otro servicio |

## 2. `Result`, no excepciones

En `application/` está **prohibido** `try/catch` (doc 12 §3). El resultado de un caso de
uso es un valor.

```ts
// @edtech/shared-kernel/src/result.type.ts
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

export const Ok  = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export const isOk  = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok
export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } => !r.ok
```

El dominio **sí** puede lanzar, pero solo errores de dominio tipados
(`module.errors.ts`), y el handler los convierte en `Err` — nunca los deja escapar a
`infrastructure/`.

## 3. Value Objects: validez por construcción

Sin setters públicos. Sin objeto "a medio construir". Si existe, es válido.

```ts
// domain/value-objects/nivel.vo.ts
const NIVELES = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N'] as const
export type LetraNivel = typeof NIVELES[number]

export class Nivel {
  private constructor(private readonly letra: LetraNivel) {}

  static crear(valor: string): Result<Nivel, NivelInvalidoError> {
    const letra = valor.toUpperCase()
    if (!NIVELES.includes(letra as LetraNivel)) return Err(new NivelInvalidoError(valor))
    return Ok(new Nivel(letra as LetraNivel))
  }

  get valor(): LetraNivel { return this.letra }
  indice(): number { return NIVELES.indexOf(this.letra) }
  esMayorQue(otro: Nivel): boolean { return this.indice() > otro.indice() }
  /** El nivel solo sube (doc 02 §2, regla de no-castigo). */
  maximo(otro: Nivel): Nivel { return this.esMayorQue(otro) ? this : otro }
  equals(otro: Nivel): boolean { return this.letra === otro.letra }
}
```

Otros VOs de Fase 1: `Dinero` (monto + moneda, sin `float`, sin sumar monedas distintas),
`Slug`, `Email`, `Puntaje`, `CodigoVerificacion`, `UniqueId`.

## 4. Entidades y eventos de dominio

La entidad **registra** sus eventos en tiempo pasado; no los publica. Quien publica es el
handler, después de persistir.

```ts
// @edtech/shared-kernel/src/domain-event.base.ts
export abstract class DomainEvent {
  readonly eventId: string    = crypto.randomUUID()
  readonly occurredAt: Date   = new Date()
  abstract readonly eventType: string     // 'enrollment.tomo-completado.v1'
  abstract readonly aggregateId: string
  abstract payload(): Record<string, unknown>
}

export abstract class AggregateRoot {
  #events: DomainEvent[] = []
  protected record(e: DomainEvent): void { this.#events.push(e) }
  pullEvents(): DomainEvent[] { const e = this.#events; this.#events = []; return e }
}
```

```ts
// domain/entities/matricula.entity.ts  (enrollment-progress-service)
export class Matricula extends AggregateRoot {
  private constructor(
    private readonly id: UniqueId,
    private readonly usuarioId: UniqueId,
    private readonly cursoId: UniqueId,
    private estado: EstadoMatricula,
    private readonly leccionesCompletadas: Set<string>,
    private readonly tomosCompletados: Set<string>,
  ) { super() }

  static habilitarPorPago(
    id: UniqueId, usuarioId: UniqueId, cursoId: UniqueId, ordenId: UniqueId,
  ): Matricula {
    const m = new Matricula(id, usuarioId, cursoId, 'ACTIVA', new Set(), new Set())
    m.record(new MatriculaCreadaEvent(id.valor, usuarioId.valor, cursoId.valor, 'PAGO', ordenId.valor))
    return m
  }

  completarLeccion(leccionId: UniqueId, tomo: TomoProyectado): Result<void, MatriculaError> {
    if (this.estado !== 'ACTIVA') return Err(new MatriculaNoActivaError(this.id.valor))
    if (this.leccionesCompletadas.has(leccionId.valor)) return Ok(undefined)   // idempotente
    if (!tomo.contieneLeccion(leccionId)) return Err(new LeccionFueraDelCursoError(leccionId.valor))

    this.leccionesCompletadas.add(leccionId.valor)
    this.record(new LeccionCompletadaEvent(
      this.id.valor, this.usuarioId.valor, this.cursoId.valor, tomo.id, leccionId.valor,
    ))
    return Ok(undefined)
  }

  /** Un tomo se completa solo si TODAS sus lecciones están hechas y la evaluación aprobada. */
  intentarCompletarTomo(tomo: TomoProyectado, evaluacionAprobada: boolean): Result<void, MatriculaError> {
    if (this.tomosCompletados.has(tomo.id)) return Ok(undefined)
    if (!evaluacionAprobada) return Ok(undefined)
    if (!tomo.leccionIds.every(l => this.leccionesCompletadas.has(l))) return Ok(undefined)

    this.tomosCompletados.add(tomo.id)
    this.record(new TomoCompletadoEvent(this.id.valor, this.usuarioId.valor, this.cursoId.valor, tomo.id))
    return Ok(undefined)
  }
}
```

Fíjate en lo que **no** hay: ni `setEstado`, ni un campo público, ni una consulta a base de
datos, ni un `if (process.env...)`. `TomoProyectado` es un tipo del propio dominio, no una
fila de Drizzle.

## 5. Ports de salida

Viven en `domain/ports-out/`. Son interfaces del dominio; su implementación está en
`infrastructure/out/`.

```ts
// domain/ports-out/matricula.repository.ts
export interface MatriculaRepository {
  porUsuarioYCurso(usuarioId: UniqueId, cursoId: UniqueId): Promise<Matricula | null>
  porId(id: UniqueId): Promise<Matricula | null>
  guardar(m: Matricula): Promise<void>
}

// @edtech/shared-kernel/src/event-publisher.port.ts  — lo comparten los 6 servicios
export interface IEventPublisher {
  publish(events: DomainEvent[]): Promise<void>
}
```

**No hay ports de entrada explícitos.** La entrada es el `CommandBus`/`QueryBus`
(§6), tal como pide el mega-prompt §4.1.

## 6. CommandBus / QueryBus

```ts
// @edtech/shared-kernel/src/bus.ts
export interface Command { readonly _tag: string }
export interface Query   { readonly _tag: string }

export interface CommandHandler<C extends Command, T, E> {
  readonly handles: C['_tag']
  execute(cmd: C): Promise<Result<T, E>>
}

export class CommandBus {
  #handlers = new Map<string, CommandHandler<any, any, any>>()
  register(h: CommandHandler<any, any, any>) { this.#handlers.set(h.handles, h) }
  dispatch<T, E>(cmd: Command): Promise<Result<T, E>> {
    const h = this.#handlers.get(cmd._tag)
    if (!h) throw new Error(`Sin handler para ${cmd._tag}`)   // error de arranque, no de negocio
    return h.execute(cmd)
  }
}
```

Un caso de uso completo, con el patrón **persistir → `pullEvents()` → publicar**:

```ts
// application/completar-leccion/completar-leccion.handler.ts
export type CompletarLeccionCommand = {
  readonly _tag: 'CompletarLeccion'
  readonly usuarioId: string
  readonly cursoId: string
  readonly leccionId: string
}

export type CompletarLeccionResponse = { tomoCompletado: boolean; cursoCompletado: boolean }

export class CompletarLeccionHandler
  implements CommandHandler<CompletarLeccionCommand, CompletarLeccionResponse, MatriculaError> {
  readonly handles = 'CompletarLeccion' as const

  constructor(
    private readonly matriculas: MatriculaRepository,
    private readonly cursos: CursoProyeccionRepository,
    private readonly publisher: IEventPublisher,
  ) {}

  async execute(cmd: CompletarLeccionCommand): Promise<Result<CompletarLeccionResponse, MatriculaError>> {
    const usuarioId = UniqueId.desde(cmd.usuarioId)
    const cursoId   = UniqueId.desde(cmd.cursoId)

    const matricula = await this.matriculas.porUsuarioYCurso(usuarioId, cursoId)
    if (!matricula) return Err(new SinMatriculaError(cmd.usuarioId, cmd.cursoId))

    const curso = await this.cursos.porId(cursoId)
    if (!curso) return Err(new CursoNoProyectadoError(cmd.cursoId))

    const tomo = curso.tomoDeLeccion(UniqueId.desde(cmd.leccionId))
    if (!tomo) return Err(new LeccionFueraDelCursoError(cmd.leccionId))

    const r = matricula.completarLeccion(UniqueId.desde(cmd.leccionId), tomo)
    if (isErr(r)) return r

    const evalOk = await this.matriculas.evaluacionAprobada(matricula.idValor, tomo.id)
    matricula.intentarCompletarTomo(tomo, evalOk)

    await this.matriculas.guardar(matricula)          // 1. persistir
    const eventos = matricula.pullEvents()            // 2. extraer
    await this.publisher.publish(eventos)             // 3. publicar

    return Ok({
      tomoCompletado:  eventos.some(e => e.eventType === 'enrollment.tomo-completado.v1'),
      cursoCompletado: eventos.some(e => e.eventType === 'enrollment.curso-completado.v1'),
    })
  }
}
```

> **El hueco conocido de este patrón.** Entre `guardar()` y `publish()` el proceso puede
> morir: los datos quedan y el evento se pierde. La solución completa es el patrón
> *outbox*. **En Fase 1 no se implementa** — se documenta como **R6** (doc 15) con su
> mitigación de corto plazo (job de reconciliación que compara efectos y reemite) y su
> ruta de solución (tabla `outbox` en cada schema + poller). Está escrito acá para que
> Fable no lo "descubra" a medias ni lo invente distinto en cada servicio.

## 7. Flujo de control completo

**Entrada HTTP:**

```
ALB → ruta Express → controlador único → CommandBus.dispatch(cmd)
    → CommandHandler → entidad de dominio (muta + registra evento)
    → repository.guardar()  → pullEvents() → IEventPublisher.publish()
    → EventBridge  → regla → SQS del consumidor → on-[evento].handler.ts
```

**Entrada por mensaje (consumidor SQS):**

```
SQS poller → on-pago-confirmado.handler.ts
    → dedupe por event_id en processed_events  (si ya estaba → ACK y salir)
    → traduce el evento a un Command
    → CommandBus.dispatch(cmd)     ← el mismo camino que HTTP
    → si Ok → ACK · si Err de negocio → ACK + log (no reintentar lo irreparable)
    → si Err de infraestructura → NACK → SQS reintenta → DLQ
```

El consumidor **no** tiene lógica de negocio: traduce y despacha. Si un `on-*.handler.ts`
empieza a decidir cosas, esa decisión pertenece a un `CommandHandler`.

## 8. Controlador único por servicio

Un solo controlador que no conoce excepciones de dominio: mapea `Result` a HTTP.

```ts
// infrastructure/in/http/controller.ts
export class Controller {
  constructor(private readonly bus: CommandBus, private readonly queries: QueryBus) {}

  async handle(req: Request, res: Response) {
    const r = await this.bus.dispatch(req.locals.command)
    if (isOk(r)) return res.status(req.locals.successStatus ?? 200).json({ data: r.value })
    return res.status(codigoHttp(r.error.code)).json({
      error: { code: r.error.code, message: r.error.message },
    })
  }
}

// Mapa explícito código de dominio → HTTP. Sin instanceof, sin cadena de catch.
const MAPA: Record<string, number> = {
  SIN_MATRICULA: 403, MATRICULA_NO_ACTIVA: 403, LECCION_FUERA_DEL_CURSO: 400,
  CURSO_NO_ENCONTRADO: 404, NIVEL_INVALIDO: 400, ORDEN_EXPIRADA: 409,
}
const codigoHttp = (code: string) => MAPA[code] ?? 500
```

## 9. Prohibiciones, con su regla de lint

| Prohibido | Por qué | Lo detecta |
|---|---|---|
| Sufijo `Dto` | La entrada es `Command`/`Query`, la salida `...Response` | lint propio (12 §3) |
| `setX()` público en entidades | Rompe la validez por construcción | lint propio |
| `try/catch` en `application/` | Se usa `Result` | lint propio |
| `import ... from 'express'` en `domain/` o `application/` | Regla de dependencia | dependency-cruiser |
| `@aws-sdk/*` fuera de `infrastructure/` | Regla de dependencia | dependency-cruiser |
| `any` sin comentario `// eslint-disable` justificado | Anula el tipado que sostiene el diseño | eslint |
| `SELECT *` serializado directo a la respuesta | I-5, fuga de respuestas correctas | revisión + test de fuga |
| Import de `../../<otro-servicio>/` | Frontera de servicio | arch-check (12 §2, regla 5) |

## 10. Estructura de directorios por servicio

Idéntica en los seis. La verifica un script (doc 12 §4).

```
services/<servicio>/
├── src/
│   ├── domain/
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── events/                 # un archivo por evento publicado
│   │   ├── ports-out/              # repositorios, gateways, (IEventPublisher viene del kernel)
│   │   ├── services/               # servicios de dominio puros
│   │   └── module.errors.ts
│   ├── application/
│   │   └── <feature-en-kebab-case>/
│   │       ├── <feature>.handler.ts
│   │       └── <feature>.handler.test.ts
│   └── infrastructure/
│       ├── in/
│       │   ├── http/               # rutas + controlador + mappers de entrada
│       │   └── messaging/          # on-<evento>.handler.ts + poller SQS
│       ├── out/
│       │   ├── persistencia/       # schema drizzle + repositorios
│       │   ├── eventbridge-event.publisher.ts
│       │   └── <gateways externos>/
│       ├── config/                 # lectura de env y secretos, en un solo lugar
│       └── <servicio>.di.ts        # composition root: lo único que "conoce" todo
├── migrations/
├── infra/                          # terraform propio del servicio
├── Dockerfile
├── package.json
├── events-catalog.md               # qué publica y qué consume (contrato público)
└── openapi.yaml
```

El `.di.ts` es el **único** archivo donde se instancian implementaciones concretas. Si un
handler hace `new DrizzleMatriculaRepository()`, está mal.

## 11. Tests, por capa

| Capa | Qué se prueba | Con qué |
|---|---|---|
| `domain/` | Invariantes y transiciones de estado. Sin mocks: son objetos puros | `bun test` |
| `application/` | El caso de uso completo con **dobles de los ports-out** (repos en memoria, publisher que acumula en un array) | `bun test` |
| `infrastructure/out/persistencia` | Que el repositorio guarda y reconstruye la entidad igual | `bun test` + Postgres en Docker |
| `infrastructure/in/messaging` | Idempotencia: entregar el mismo evento dos veces produce un solo efecto | `bun test` + Postgres |
| Contrato de eventos | Que el JSON publicado valida contra el schema del doc 05 | `bun test` (12 §5) |

El publisher de pruebas es la pieza que hace testeable todo el patrón:

```ts
export class InMemoryEventPublisher implements IEventPublisher {
  readonly publicados: DomainEvent[] = []
  async publish(events: DomainEvent[]) { this.publicados.push(...events) }
}
```
