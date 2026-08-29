export abstract class GamificationError extends Error {
  abstract readonly code: string
}

export class PerfilNoEncontradoError extends GamificationError {
  readonly code = 'PERFIL_NO_ENCONTRADO'
  constructor(usuarioId: string) {
    super(`No existe perfil de gamificación para ${usuarioId}`)
  }
}

export class CertificadoNoEncontradoError extends GamificationError {
  readonly code = 'CERTIFICADO_NO_ENCONTRADO'
  constructor(ref: string) {
    super(`No existe el certificado ${ref}`)
  }
}

export class CriterioInvalidoError extends GamificationError {
  readonly code = 'CRITERIO_INVALIDO'
  constructor(criterio: string) {
    super(`Criterio de insignia desconocido: ${criterio}`)
  }
}

export class CodigoInvalidoError extends GamificationError {
  readonly code = 'CODIGO_INVALIDO'
  constructor(codigo: string) {
    super(`Código de verificación con formato inválido: ${codigo}`)
  }
}
