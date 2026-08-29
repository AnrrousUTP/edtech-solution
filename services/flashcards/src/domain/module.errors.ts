export abstract class FlashcardsError extends Error {
  abstract readonly code: string
}

export class MazoNoEncontradoError extends FlashcardsError {
  readonly code = 'MAZO_NO_ENCONTRADO'
  constructor(ref: string) {
    super(`No existe el mazo ${ref}`)
  }
}

export class TarjetaNoEncontradaError extends FlashcardsError {
  readonly code = 'TARJETA_NO_ENCONTRADA'
  constructor(id: string) {
    super(`No existe la tarjeta ${id}`)
  }
}

export class MazoNoRevisableError extends FlashcardsError {
  readonly code = 'MAZO_NO_REVISABLE'
  constructor(estado: string) {
    super(`El mazo está en estado ${estado}: no admite revisión`)
  }
}

export class MotivoRequeridoError extends FlashcardsError {
  readonly code = 'MOTIVO_REQUERIDO'
  constructor() {
    super('Rechazar una tarjeta exige un motivo (doc 10 §6)')
  }
}

export class GeneracionError extends FlashcardsError {
  readonly code = 'GENERACION_FALLIDA'
  constructor(motivo: string) {
    super(`No se pudo generar el mazo: ${motivo}`)
  }
}

export class SalidaInvalidaError extends FlashcardsError {
  readonly code = 'SALIDA_INVALIDA'
  constructor(motivo: string) {
    super(`La salida del modelo no es utilizable: ${motivo}`)
  }
}
