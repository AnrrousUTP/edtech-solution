export abstract class CatalogError extends Error {
  abstract readonly code: string
}

export class NivelInvalidoError extends CatalogError {
  readonly code = 'NIVEL_INVALIDO'
  constructor(valor: string) {
    super(`Nivel inválido: "${valor}" (se espera A-N)`)
  }
}

export class SlugInvalidoError extends CatalogError {
  readonly code = 'SLUG_INVALIDO'
  constructor(valor: string) {
    super(`Slug inválido: "${valor}"`)
  }
}

export class DineroInvalidoError extends CatalogError {
  readonly code = 'DINERO_INVALIDO'
  constructor(motivo: string) {
    super(motivo)
  }
}

export class CursoNoEncontradoError extends CatalogError {
  readonly code = 'CURSO_NO_ENCONTRADO'
  constructor(ref: string) {
    super(`No existe el curso ${ref}`)
  }
}

export class CursoNoPublicableError extends CatalogError {
  readonly code = 'CURSO_NO_PUBLICABLE'
  constructor(motivo: string) {
    super(motivo)
  }
}

export class OrdenNoContiguoError extends CatalogError {
  readonly code = 'ORDEN_NO_CONTIGUO'
  constructor(donde: string) {
    super(`El orden de ${donde} debe ser contiguo y sin huecos, empezando en 1`)
  }
}

export class TomoNoEncontradoError extends CatalogError {
  readonly code = 'TOMO_NO_ENCONTRADO'
  constructor(id: string) {
    super(`No existe el tomo ${id}`)
  }
}

export class LeccionNoEncontradaError extends CatalogError {
  readonly code = 'LECCION_NO_ENCONTRADA'
  constructor(id: string) {
    super(`No existe la lección ${id}`)
  }
}

export class CarreraNoEncontradaError extends CatalogError {
  readonly code = 'CARRERA_NO_ENCONTRADA'
  constructor(id: string) {
    super(`No existe la carrera ${id}`)
  }
}

export class BancoNoEncontradoError extends CatalogError {
  readonly code = 'BANCO_NO_ENCONTRADO'
  constructor(id: string) {
    super(`No existe el banco de preguntas ${id}`)
  }
}

export class BancoInvalidoError extends CatalogError {
  readonly code = 'BANCO_INVALIDO'
  constructor(motivo: string) {
    super(motivo)
  }
}

export class ContenidoInvalidoError extends CatalogError {
  readonly code = 'CONTENIDO_INVALIDO'
  constructor(motivo: string) {
    super(motivo)
  }
}

export class SlugDuplicadoError extends CatalogError {
  readonly code = 'SLUG_DUPLICADO'
  constructor(slug: string) {
    super(`Ya existe un curso con slug "${slug}"`)
  }
}
