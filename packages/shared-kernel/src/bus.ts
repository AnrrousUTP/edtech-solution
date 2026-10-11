import type { Result } from './result.type'

export interface Command {
  readonly _tag: string
}
export interface Query {
  readonly _tag: string
}

export interface CommandHandler<C extends Command, T, E> {
  readonly handles: C['_tag']
  execute(cmd: C): Promise<Result<T, E>>
}

export interface QueryHandler<Q extends Query, T, E> {
  readonly handles: Q['_tag']
  execute(query: Q): Promise<Result<T, E>>
}

export class CommandBus {
  #handlers = new Map<string, CommandHandler<Command, unknown, unknown>>()

  register<C extends Command, T, E>(h: CommandHandler<C, T, E>): void {
    this.#handlers.set(h.handles, h as CommandHandler<Command, unknown, unknown>)
  }

  dispatch<T, E>(cmd: Command): Promise<Result<T, E>>
  dispatch<T, E>(cmd: Command & { readonly [key: string]: unknown }): Promise<Result<T, E>>
  dispatch<T, E>(cmd: Command): Promise<Result<T, E>> {
    const h = this.#handlers.get(cmd._tag)
    if (!h) throw new Error(`Sin handler para ${cmd._tag}`) // error de arranque, no de negocio
    return h.execute(cmd) as Promise<Result<T, E>>
  }
}

export class QueryBus {
  #handlers = new Map<string, QueryHandler<Query, unknown, unknown>>()

  register<Q extends Query, T, E>(h: QueryHandler<Q, T, E>): void {
    this.#handlers.set(h.handles, h as QueryHandler<Query, unknown, unknown>)
  }

  dispatch<T, E>(query: Query): Promise<Result<T, E>>
  dispatch<T, E>(query: Query & { readonly [key: string]: unknown }): Promise<Result<T, E>>
  dispatch<T, E>(query: Query): Promise<Result<T, E>> {
    const h = this.#handlers.get(query._tag)
    if (!h) throw new Error(`Sin handler para ${query._tag}`)
    return h.execute(query) as Promise<Result<T, E>>
  }
}
