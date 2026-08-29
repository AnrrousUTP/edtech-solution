import { Err, Ok, type Result } from '@edtech/shared-kernel'
import { DineroInvalidoError } from '../module.errors'

/** Monto + moneda, nunca float suelto (doc 03 §2): se guarda en centavos. */
export class Dinero {
  private constructor(
    readonly centavos: number,
    readonly moneda: string,
  ) {}

  static crear(monto: number, moneda: string): Result<Dinero, DineroInvalidoError> {
    if (!Number.isFinite(monto) || monto < 0)
      return Err(new DineroInvalidoError(`Monto inválido: ${monto}`))
    if (!/^[A-Z]{3}$/.test(moneda))
      return Err(new DineroInvalidoError(`Moneda inválida: ${moneda}`))
    const centavos = Math.round(monto * 100)
    if (Math.abs(centavos - monto * 100) > 1e-6)
      return Err(new DineroInvalidoError(`Monto con más de 2 decimales: ${monto}`))
    return Ok(new Dinero(centavos, moneda))
  }

  get monto(): number {
    return this.centavos / 100
  }

  equals(otro: Dinero): boolean {
    return this.centavos === otro.centavos && this.moneda === otro.moneda
  }
}
