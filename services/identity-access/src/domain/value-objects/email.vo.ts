import { Err, Ok, type Result } from '@edtech/shared-kernel'
import { EmailInvalidoError } from '../module.errors'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export class Email {
  private constructor(private readonly direccion: string) {}

  static crear(valor: string): Result<Email, EmailInvalidoError> {
    const normalizado = valor.trim().toLowerCase()
    if (!EMAIL_RE.test(normalizado)) return Err(new EmailInvalidoError(valor))
    return Ok(new Email(normalizado))
  }

  get valor(): string {
    return this.direccion
  }
}
