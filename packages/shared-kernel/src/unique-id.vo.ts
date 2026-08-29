import { Err, Ok, type Result } from './result.type'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class IdInvalidoError extends Error {
  readonly code = 'ID_INVALIDO'
  constructor(valor: string) {
    super(`Id inválido: ${valor}`)
  }
}

export class UniqueId {
  private constructor(readonly valor: string) {}

  static nuevo(): UniqueId {
    return new UniqueId(crypto.randomUUID())
  }

  /** Para valores ya validados (filas de BD, ids generados). Lanza si no es UUID. */
  static desde(valor: string): UniqueId {
    if (!UUID_RE.test(valor)) throw new IdInvalidoError(valor)
    return new UniqueId(valor.toLowerCase())
  }

  /** Para entrada externa: valida sin lanzar. */
  static intentar(valor: string): Result<UniqueId, IdInvalidoError> {
    if (!UUID_RE.test(valor)) return Err(new IdInvalidoError(valor))
    return Ok(new UniqueId(valor.toLowerCase()))
  }

  equals(otro: UniqueId): boolean {
    return this.valor === otro.valor
  }
}
