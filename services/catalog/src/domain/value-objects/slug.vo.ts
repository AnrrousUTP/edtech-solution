import { Err, Ok, type Result } from '@edtech/shared-kernel'
import { SlugInvalidoError } from '../module.errors'

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export class Slug {
  private constructor(readonly valor: string) {}

  static crear(valor: string): Result<Slug, SlugInvalidoError> {
    const v = valor.trim().toLowerCase()
    if (!SLUG_RE.test(v) || v.length > 80) return Err(new SlugInvalidoError(valor))
    return Ok(new Slug(v))
  }
}
