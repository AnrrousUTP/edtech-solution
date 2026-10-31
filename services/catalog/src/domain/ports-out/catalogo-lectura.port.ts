// Read models del catálogo. Los mappers de la implementación son EXPLÍCITOS:
// respuesta_correcta y solucion_esperada no tienen representación en estos
// tipos, así que no pueden fugarse por construcción (I-5).
export type CursoResumen = {
  id: string
  slug: string
  titulo: string
  descripcion: string
  tecnologia: string
  nivelMin: string
  nivelMax: string
  precio: number
  moneda: string
  imagenUrl: string | null
  estado: string
  publicadoAt: string | null
}

export type LeccionResumen = { id: string; orden: number; titulo: string; duracionMin: number }
export type MaterialResumen = {
  id: string
  orden: number
  titulo: string
  descripcion: string | null
  tipo: string
  url: string
  textoExtraido?: string
}

export type TomoDetalle = {
  id: string
  orden: number
  titulo: string
  descripcion: string | null
  umbral: number
  materiales: MaterialResumen[]
  lecciones: LeccionResumen[]
}

export type CursoDetalle = CursoResumen & { versionPrecio: number; tomos: TomoDetalle[] }

export type BloquePublico = { orden: number; tipo: string; contenido: Record<string, unknown> }
export type EjercicioPublico = { id: string; enunciado: string; pistas: unknown[] } // sin solucionEsperada (I-5)

export type LeccionContenido = {
  id: string
  titulo: string
  cursoId: string
  tomoId: string
  bloques: BloquePublico[]
  ejercicios: EjercicioPublico[]
}

export type LeccionContenidoAdmin = LeccionContenido & {
  ejercicios: (EjercicioPublico & { solucionEsperada: unknown })[]
}

export type PreguntaPublica = {
  id: string
  tipo: string
  enunciado: string
  opciones: { id: string; texto: string }[] // sin marcar la correcta (I-5)
  puntaje: number
}

export type PreguntaConRespuesta = PreguntaPublica & {
  respuestaCorrecta: unknown
  nivel: string | null
}

export type EvaluacionPublica = {
  bancoId: string
  titulo: string
  umbral: number
  preguntas: PreguntaPublica[]
}

export type RespuestasBanco = {
  bancoId: string
  uso: string
  tomoId: string | null
  umbral: number | null
  preguntas: PreguntaConRespuesta[]
}

export type ContextoTomo = {
  cursoId: string
  cursoSlug: string
  cursoTitulo: string
  tomoId: string
  tomoTitulo: string
}

export type BancoAdmin = {
  bancoId: string
  uso: string
  tomoId: string | null
  cursoId: string | null
  titulo: string
  preguntas: PreguntaConRespuesta[]
}

export type CarreraResumen = {
  id: string
  slug: string
  titulo: string
  descripcion: string
  imagenUrl: string | null
  estado: string
  cursos: { cursoId: string; orden: number }[]
}

export interface CatalogoLectura {
  listarCursos(incluirNoPublicados: boolean): Promise<CursoResumen[]>
  cursoPorSlug(slug: string, incluirNoPublicados: boolean): Promise<CursoDetalle | null>
  cursoPorId(id: string, incluirNoPublicados: boolean): Promise<CursoDetalle | null>
  leccionContenido(leccionId: string): Promise<LeccionContenido | null>
  leccionContenidoAdmin(leccionId: string): Promise<LeccionContenidoAdmin | null>
  evaluacionDeTomo(tomoId: string): Promise<EvaluacionPublica | null>
  refuerzoDeTomo(tomoId: string): Promise<EvaluacionPublica | null>
  evaluacionInicialDeCurso(cursoId: string): Promise<EvaluacionPublica | null>
  nivelacion(): Promise<EvaluacionPublica | null>
  diagnosticoPrevio(): Promise<EvaluacionPublica | null>
  contextoDeTomo(tomoId: string): Promise<ContextoTomo | null>
  listarBancosAdmin(): Promise<BancoAdmin[]>
  /** SOLO para la API interna de corrección (A-19). */
  respuestasDeBanco(bancoId: string): Promise<RespuestasBanco | null>
  listarCarreras(incluirNoPublicadas: boolean): Promise<CarreraResumen[]>
}
