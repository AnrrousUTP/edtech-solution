export abstract class EnrollmentError extends Error {
  abstract readonly code: string
}

export class SinMatriculaError extends EnrollmentError {
  readonly code = 'SIN_MATRICULA'
  constructor(usuarioId: string, cursoId: string) {
    super(`El usuario ${usuarioId} no tiene matrícula en el curso ${cursoId}`)
  }
}

export class MatriculaNoActivaError extends EnrollmentError {
  readonly code = 'MATRICULA_NO_ACTIVA'
  constructor(id: string) {
    super(`La matrícula ${id} no está activa`)
  }
}

export class MatriculaDuplicadaError extends EnrollmentError {
  readonly code = 'MATRICULA_DUPLICADA'
  constructor(usuarioId: string, cursoId: string) {
    super(`El usuario ${usuarioId} ya está matriculado en ${cursoId}`)
  }
}

export class CursoNoProyectadoError extends EnrollmentError {
  readonly code = 'CURSO_NO_PROYECTADO'
  constructor(cursoId: string) {
    super(`El curso ${cursoId} no existe en la proyección local`)
  }
}

export class CursoNoPublicadoError extends EnrollmentError {
  readonly code = 'CURSO_NO_PUBLICADO'
  constructor(cursoId: string) {
    super(`El curso ${cursoId} no está publicado`)
  }
}

export class CursoNoGratuitoError extends EnrollmentError {
  readonly code = 'CURSO_NO_GRATUITO'
  constructor(cursoId: string) {
    super(`El curso ${cursoId} no es gratuito: la matrícula llega por pago confirmado`)
  }
}

export class LeccionFueraDelCursoError extends EnrollmentError {
  readonly code = 'LECCION_FUERA_DEL_CURSO'
  constructor(leccionId: string) {
    super(`La lección ${leccionId} no pertenece al curso de la matrícula`)
  }
}

export class IntentoNoEncontradoError extends EnrollmentError {
  readonly code = 'INTENTO_NO_ENCONTRADO'
  constructor(id: string) {
    super(`No existe el intento ${id}`)
  }
}

export class IntentoYaEntregadoError extends EnrollmentError {
  readonly code = 'INTENTO_YA_ENTREGADO'
  constructor(id: string) {
    super(`El intento ${id} ya fue entregado: es inmutable`)
  }
}

export class IntentoAjenoError extends EnrollmentError {
  readonly code = 'INTENTO_AJENO'
  constructor(id: string) {
    super(`El intento ${id} pertenece a otro usuario`)
  }
}

export class BancoNoDisponibleError extends EnrollmentError {
  readonly code = 'BANCO_NO_DISPONIBLE'
  constructor(detalle: string) {
    super(`No se pudo obtener el banco de preguntas: ${detalle}. Reintenta en unos minutos`)
  }
}

export class TomoNoEncontradoError extends EnrollmentError {
  readonly code = 'TOMO_NO_ENCONTRADO'
  constructor(id: string) {
    super(`El tomo ${id} no existe en la proyección`)
  }
}
