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

export const tomoDetalle = z.object({
  id: z.string(),
  orden: z.number(),
  titulo: z.string(),
  descripcion: z.string().nullable(),
  umbral: z.number(),
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

export const carreraResumen = z.object({
  id: z.string(),
  slug: z.string(),
  titulo: z.string(),
  descripcion: z.string(),
  imagenUrl: z.string().nullable(),
  estado: z.string(),
  cursos: z.array(z.object({ cursoId: z.string(), orden: z.number() })),
})

export type CursoResumen = z.infer<typeof cursoResumen>
export type CursoDetalle = z.infer<typeof cursoDetalle>
export type LeccionContenido = z.infer<typeof leccionContenido>
export type EvaluacionPublica = z.infer<typeof evaluacionPublica>
export type CarreraResumen = z.infer<typeof carreraResumen>

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

  nivelacion: () =>
    llamarOpcional('/api/catalog/nivelacion', evaluacionPublica, { autenticado: false }),

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
}
