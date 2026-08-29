export abstract class PaymentsError extends Error {
  abstract readonly code: string
}

export class OrdenNoEncontradaError extends PaymentsError {
  readonly code = 'ORDEN_NO_ENCONTRADA'
  constructor(ref: string) {
    super(`No existe la orden ${ref}`)
  }
}

export class OrdenExpiradaError extends PaymentsError {
  readonly code = 'ORDEN_EXPIRADA'
  constructor(id: string) {
    super(`La orden ${id} expiró (24 h sin completarse)`)
  }
}

export class OrdenNoCapturableError extends PaymentsError {
  readonly code = 'ORDEN_NO_CAPTURABLE'
  constructor(estado: string) {
    super(`Una orden en estado ${estado} no se puede capturar`)
  }
}

export class OrdenAjenaError extends PaymentsError {
  readonly code = 'ORDEN_AJENA'
  constructor(id: string) {
    super(`La orden ${id} pertenece a otro usuario`)
  }
}

export class CursoNoDisponibleError extends PaymentsError {
  readonly code = 'CURSO_NO_DISPONIBLE'
  constructor(cursoId: string) {
    super(`El curso ${cursoId} no está publicado o no tiene precio conocido`)
  }
}

export class CursoGratuitoError extends PaymentsError {
  readonly code = 'CURSO_GRATUITO'
  constructor(cursoId: string) {
    super(`El curso ${cursoId} es gratuito: se matricula sin pasar por el pago`)
  }
}

export class YaCompradoError extends PaymentsError {
  readonly code = 'YA_COMPRADO'
  constructor(cursoId: string) {
    super(`Ya compraste el curso ${cursoId}`)
  }
}

export class DineroInvalidoError extends PaymentsError {
  readonly code = 'DINERO_INVALIDO'
  constructor(motivo: string) {
    super(motivo)
  }
}

export class PasarelaError extends PaymentsError {
  readonly code = 'PASARELA_ERROR'
  constructor(motivo: string) {
    super(`La pasarela de pago falló: ${motivo}`)
  }
}

export class FirmaInvalidaError extends PaymentsError {
  readonly code = 'FIRMA_INVALIDA'
  constructor() {
    super('La firma del webhook no valida')
  }
}
