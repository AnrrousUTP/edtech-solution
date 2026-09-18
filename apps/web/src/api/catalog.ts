import { z } from 'zod'
import { llamar, llamarOpcional } from '@/lib/api'

export const cursoResumen = z.object({
  id: z.string(),
  slug: z.string(),
  titulo: z.string(),
  descripcion: z.string(),
  tecnologia: z.string(),
  nivelMin: z.string(),
  nivelMax: z.string(),
  precio: z.number(),
  moneda: z.string(),
  imagenUrl: z.string().nullable(),
  estado: z.string(),
  publicadoAt: z.string().nullable(),
})

export const leccionResumen = z.object({
  id: z.string(),
  orden: z.number(),
  titulo: z.string(),
  duracionMin: z.number(),
})

export const materialResumen = z.object({
  id: z.string(),
  orden: z.number(),
  titulo: z.string(),
  descripcion: z.string().nullable(),
  tipo: z.string(),
  url: z.string(),
})

export const tomoDetalle = z.object({
  id: z.string(),
  orden: z.number(),
  titulo: z.string(),
  descripcion: z.string().nullable(),
  umbral: z.number(),
  materiales: z.array(materialResumen).default([]),
  lecciones: z.array(leccionResumen),
})

export const cursoDetalle = cursoResumen.extend({
  versionPrecio: z.number(),
  tomos: z.array(tomoDetalle),
})

/** El contenido viaja como Markdown y bloques estructurados, nunca HTML
 *  renderizado (doc 11 §7.4): es lo que evita un WebView en la app móvil. */
export const bloque = z.object({
  orden: z.number(),
  tipo: z.string(),
  contenido: z.record(z.unknown()),
})

export const leccionContenido = z.object({
  id: z.string(),
  titulo: z.string(),
  tomoId: z.string(),
  bloques: z.array(bloque),
  ejercicios: z.array(
    z.object({ id: z.string(), enunciado: z.string(), pistas: z.array(z.unknown()) }),
  ),
})

const leccionContenidoAdmin = leccionContenido.extend({
  ejercicios: z.array(
    z.object({
      id: z.string(),
      enunciado: z.string(),
      solucionEsperada: z.unknown(),
      pistas: z.array(z.unknown()),
    }),
  ),
})

export const preguntaPublica = z.object({
  id: z.string(),
  tipo: z.string(),
  enunciado: z.string(),
  opciones: z.array(z.object({ id: z.string(), texto: z.string() })),
  puntaje: z.number(),
})

export const evaluacionPublica = z.object({
  bancoId: z.string(),
  titulo: z.string(),
  umbral: z.number(),
  preguntas: z.array(preguntaPublica),
})

export const contextoTomo = z.object({
  cursoId: z.string(),
  cursoSlug: z.string(),
  cursoTitulo: z.string(),
  tomoId: z.string(),
  tomoTitulo: z.string(),
})

export const carreraResumen = z.object({
  id: z.string(),
  slug: z.string(),
  titulo: z.string(),
  descripcion: z.string(),
  imagenUrl: z.string().nullable(),
  estado: z.string(),
  cursos: z.array(z.object({ cursoId: z.string(), orden: z.number() })),
})

export const preguntaAdmin = preguntaPublica.extend({
  nivel: z.string().nullable(),
  respuestaCorrecta: z.unknown(),
})

export const bancoAdmin = z.object({
  bancoId: z.string(),
  uso: z.string(),
  tomoId: z.string().nullable(),
  cursoId: z.string().nullable(),
  titulo: z.string(),
  preguntas: z.array(preguntaAdmin),
})

export type CursoResumen = z.infer<typeof cursoResumen>
export type CursoDetalle = z.infer<typeof cursoDetalle>
export type LeccionContenido = z.infer<typeof leccionContenido>
export type EvaluacionPublica = z.infer<typeof evaluacionPublica>
export type CarreraResumen = z.infer<typeof carreraResumen>
export type BancoAdmin = z.infer<typeof bancoAdmin>

export const catalogApi = {
  cursos: () =>
    llamar('/api/catalog/cursos', z.array(cursoResumen), {
      autenticado: false,
      revalidar: 60,
    }),

  curso: (slugOId: string) =>
    llamarOpcional(`/api/catalog/cursos/${slugOId}`, cursoDetalle, {
      autenticado: false,
      revalidar: 60,
    }),

  carreras: () =>
    llamar('/api/catalog/carreras', z.array(carreraResumen), {
      autenticado: false,
      revalidar: 60,
    }),

  leccion: (leccionId: string) =>
    llamarOpcional(`/api/catalog/lecciones/${leccionId}`, leccionContenido),

  evaluacionDeTomo: (tomoId: string) =>
    llamarOpcional(`/api/catalog/tomos/${tomoId}/evaluacion`, evaluacionPublica),

  refuerzoDeTomo: (tomoId: string) =>
    llamarOpcional(`/api/catalog/tomos/${tomoId}/refuerzo`, evaluacionPublica),

  contextoDeTomo: (tomoId: string) =>
    llamarOpcional(`/api/catalog/tomos/${tomoId}/contexto`, contextoTomo, { autenticado: false }),

  nivelacion: () =>
    llamarOpcional('/api/catalog/nivelacion', evaluacionPublica, { autenticado: false }),

  diagnostico: () =>
    llamarOpcional('/api/catalog/diagnostico', evaluacionPublica, { autenticado: false }),

  evaluacionInicial: (cursoId: string) =>
    llamarOpcional(`/api/catalog/cursos/${cursoId}/evaluacion-inicial`, evaluacionPublica, {
      autenticado: false,
    }),

  // ── admin ──────────────────────────────────────────────────────────────────
  cursosAdmin: () => llamar('/api/catalog/admin/cursos', z.array(cursoResumen)),

  cursoAdmin: (slugOId: string) =>
    llamarOpcional(`/api/catalog/admin/cursos/${slugOId}`, cursoDetalle),

  publicar: (cursoId: string) =>
    llamar(
      `/api/catalog/admin/cursos/${cursoId}/publicar`,
      z.object({ estado: z.string(), publicadoAt: z.string().nullable() }),
      { metodo: 'POST' },
    ),

  despublicar: (cursoId: string, motivo: string) =>
    llamar(`/api/catalog/admin/cursos/${cursoId}/despublicar`, z.object({ estado: z.string() }), {
      metodo: 'POST',
      cuerpo: { motivo },
    }),

  cambiarPrecio: (cursoId: string, precio: number) =>
    llamar(`/api/catalog/admin/cursos/${cursoId}`, z.object({ versionPrecio: z.number() }), {
      metodo: 'PUT',
      cuerpo: { precio },
    }),

  crear: (datos: Record<string, unknown>) =>
    llamar('/api/catalog/admin/cursos', z.object({ cursoId: z.string(), slug: z.string() }), {
      metodo: 'POST',
      cuerpo: datos,
    }),

  actualizar: (cursoId: string, datos: Record<string, unknown>) =>
    llamar(`/api/catalog/admin/cursos/${cursoId}`, z.object({ versionPrecio: z.number() }), {
      metodo: 'PUT',
      cuerpo: datos,
    }),

  actualizarContenido: (cursoId: string, tomos: unknown[]) =>
    llamar(
      `/api/catalog/admin/cursos/${cursoId}/contenido`,
      z.object({
        tomos: z.array(z.object({ id: z.string(), lecciones: z.array(z.string()) })),
        lecciones: z.number(),
      }),
      {
        metodo: 'PUT',
        cuerpo: { tomos },
      },
    ),

  contenidoAdmin: (leccionId: string) =>
    llamarOpcional(`/api/catalog/admin/lecciones/${leccionId}`, leccionContenidoAdmin),

  carrerasAdmin: () => llamar('/api/catalog/admin/carreras', z.array(carreraResumen)),
  crearCarrera: (datos: Record<string, unknown>) =>
    llamar('/api/catalog/admin/carreras', z.object({ carreraId: z.string() }), {
      metodo: 'POST',
      cuerpo: datos,
    }),
  actualizarCarrera: (id: string, datos: Record<string, unknown>) =>
    llamar(`/api/catalog/admin/carreras/${id}`, z.object({ actualizado: z.boolean() }), {
      metodo: 'PUT',
      cuerpo: datos,
    }),

  bancosAdmin: () => llamar('/api/catalog/admin/bancos', z.array(bancoAdmin)),
  crearBanco: (datos: Record<string, unknown>) =>
    llamar(
      '/api/catalog/admin/bancos',
      z.object({ bancoId: z.string(), cantidadPreguntas: z.number() }),
      { metodo: 'POST', cuerpo: datos },
    ),
  actualizarBanco: (id: string, datos: Record<string, unknown>) =>
    llamar(`/api/catalog/admin/bancos/${id}`, z.object({ actualizado: z.boolean() }), {
      metodo: 'PUT',
      cuerpo: datos,
    }),
}
