import { Err, Ok, type Result } from '@edtech/shared-kernel'
import { CodigoInvalidoError } from '../module.errors'

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L): el código se dicta por teléfono
// y se transcribe a mano desde un PDF impreso.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const FORMATO = /^EDT-[A-Z2-9]{4}-[A-Z2-9]{4}$/

export class CodigoVerificacion {
  private constructor(readonly valor: string) {}

  /** Recibe el aleatorio: el dominio no lo pide (misma razón que el reloj). */
  static generar(aleatorio: () => number): CodigoVerificacion {
    const bloque = (): string =>
      Array.from(
        { length: 4 },
        () => ALFABETO[Math.floor(aleatorio() * ALFABETO.length)] ?? 'A',
      ).join('')
    return new CodigoVerificacion(`EDT-${bloque()}-${bloque()}`)
  }

  static crear(valor: string): Result<CodigoVerificacion, CodigoInvalidoError> {
    const v = valor.trim().toUpperCase()
    if (!FORMATO.test(v)) return Err(new CodigoInvalidoError(valor))
    return Ok(new CodigoVerificacion(v))
  }
}
