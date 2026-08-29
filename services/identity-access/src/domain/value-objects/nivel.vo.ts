import { Err, Ok, type Result } from '@edtech/shared-kernel'
import { NivelInvalidoError } from '../module.errors'

const NIVELES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'] as const
export type LetraNivel = (typeof NIVELES)[number]

export class Nivel {
  private constructor(private readonly letra: LetraNivel) {}

  static crear(valor: string): Result<Nivel, NivelInvalidoError> {
    const letra = valor.toUpperCase()
    if (!NIVELES.includes(letra as LetraNivel)) return Err(new NivelInvalidoError(valor))
    return Ok(new Nivel(letra as LetraNivel))
  }

  get valor(): LetraNivel {
    return this.letra
  }
  indice(): number {
    return NIVELES.indexOf(this.letra)
  }
  esMayorQue(otro: Nivel): boolean {
    return this.indice() > otro.indice()
  }
  /** El nivel solo sube (doc 02 §2, regla de no-castigo). */
  maximo(otro: Nivel): Nivel {
    return this.esMayorQue(otro) ? this : otro
  }
  equals(otro: Nivel): boolean {
    return this.letra === otro.letra
  }
}
