 
// Logger estructurado (JSON por línea). Es la única salida de log permitida:
// el lint de convenciones prohíbe console.log directo en services/ y apps/.
type Nivel = 'debug' | 'info' | 'warn' | 'error'

const ORDEN: Record<Nivel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const nivelMinimo = (): Nivel => {
  const n = (process.env.LOG_LEVEL ?? 'info').toLowerCase()
  return n === 'debug' || n === 'info' || n === 'warn' || n === 'error' ? n : 'info'
}

export class Logger {
  constructor(private readonly contexto: Record<string, unknown> = {}) {}

  child(extra: Record<string, unknown>): Logger {
    return new Logger({ ...this.contexto, ...extra })
  }

  debug(msg: string, datos?: Record<string, unknown>): void {
    this.#emitir('debug', msg, datos)
  }
  info(msg: string, datos?: Record<string, unknown>): void {
    this.#emitir('info', msg, datos)
  }
  warn(msg: string, datos?: Record<string, unknown>): void {
    this.#emitir('warn', msg, datos)
  }
  error(msg: string, datos?: Record<string, unknown>): void {
    this.#emitir('error', msg, datos)
  }

  #emitir(nivel: Nivel, msg: string, datos?: Record<string, unknown>): void {
    if (ORDEN[nivel] < ORDEN[nivelMinimo()]) return
    const linea = JSON.stringify({
      ts: new Date().toISOString(),
      nivel,
      msg,
      ...this.contexto,
      ...datos,
    })
    if (nivel === 'error') console.error(linea)
    else console.log(linea)
  }
}

export const log = new Logger()
