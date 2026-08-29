export abstract class IdentityError extends Error {
  abstract readonly code: string
}

export class NivelInvalidoError extends IdentityError {
  readonly code = 'NIVEL_INVALIDO'
  constructor(valor: string) {
    super(`Nivel inválido: "${valor}" (se espera A-N)`)
  }
}

export class EmailInvalidoError extends IdentityError {
  readonly code = 'EMAIL_INVALIDO'
  constructor(valor: string) {
    super(`Email inválido: "${valor}"`)
  }
}

export class UsuarioNoEncontradoError extends IdentityError {
  readonly code = 'USUARIO_NO_ENCONTRADO'
  constructor(id: string) {
    super(`No existe el usuario ${id}`)
  }
}

export class PerfilInvalidoError extends IdentityError {
  readonly code = 'PERFIL_INVALIDO'
  constructor(motivo: string) {
    super(motivo)
  }
}
