import { Err, Ok, type Result } from './result.type'

export type Pagina<T> = {
  items: T[]
  siguienteCursor: string | null
}

export class CursorInvalidoError extends Error {
  readonly code = 'CURSOR_INVALIDO'
  constructor() {
    super('Cursor de paginación inválido')
  }
}

/** Cursor opaco: base64url de un JSON pequeño ({ k: <última clave vista> }). */
export const codificarCursor = (datos: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(datos)).toString('base64url')

export const decodificarCursor = <T = Record<string, unknown>>(
  cursor: string,
): Result<T, CursorInvalidoError> => {
  try {
    return Ok(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T)
  } catch {
    return Err(new CursorInvalidoError())
  }
}
