import { z } from 'zod'
import { llamar, llamarOpcional } from '@/lib/api'

// ── identity ─────────────────────────────────────────────────────────────────
export const perfil = z.object({
  id: z.string(),
  email: z.string(),
  nombreVisible: z.string(),
  avatarUrl: z.string().nullable(),
  pais: z.string().nullable(),
  idioma: z.string(),
  rol: z.string(),
  nivel: z.string(),
  origenNivel: z.string(),
})

export type Perfil = z.infer<typeof perfil>

export const identityApi = {
  yo: () => llamarOpcional('/api/identity/me', perfil),
  actualizar: (cambios: { nombreVisible?: string; pais?: string | null }) =>
    llamar('/api/identity/me', z.object({ actualizado: z.boolean() }), {
      metodo: 'PUT',
      cuerpo: cambios,
    }),
}

// ── gamification ─────────────────────────────────────────────────────────────
export const perfilGamificacion = z.object({
  usuarioId: z.string(),
  puntos: z.number(),
  rachaActual: z.number(),
  rachaMaxima: z.number(),
  ultimaActividad: z.string().nullable(),
  insignias: z.array(
    z.object({ criterio: z.string(), referenciaId: z.string(), otorgadaAt: z.string() }),
  ),
  certificados: z.array(
    z.object({
      id: z.string(),
      tipo: z.string(),
      titulo: z.string(),
      codigoVerificacion: z.string(),
      pdfDisponible: z.boolean(),
      emitidoAt: z.string(),
    }),
  ),
})

export const verificacionCertificado = z.object({
  valido: z.literal(true),
  tipo: z.string(),
  titulo: z.string(),
  nombreTitular: z.string(),
  emitidoAt: z.string(),
  pdfUrl: z.string().nullable(),
})

export type PerfilGamificacion = z.infer<typeof perfilGamificacion>
export type VerificacionCertificado = z.infer<typeof verificacionCertificado>

export const gamificationApi = {
  miPerfil: () => llamarOpcional('/api/gamification/mi-perfil', perfilGamificacion),
  verificar: (codigo: string) =>
    llamarOpcional(`/api/gamification/certificados/${codigo}`, verificacionCertificado, {
      autenticado: false,
    }),
  otorgarCurso: (datos: { usuarioId: string; cursoId: string; cursoTitulo: string }) =>
    llamar(
      '/api/gamification/admin/certificados/curso',
      z.object({
        certificadoId: z.string().nullable(),
        certificadoNuevo: z.boolean(),
        insigniaOtorgada: z.boolean(),
      }),
      { metodo: 'POST', cuerpo: datos },
    ),
  otorgarCarrera: (datos: { usuarioId: string; carreraId: string; carreraTitulo: string }) =>
    llamar(
      '/api/gamification/admin/certificados/carrera',
      z.object({
        certificadoId: z.string().nullable(),
        certificadoNuevo: z.boolean(),
        insigniaOtorgada: z.boolean(),
      }),
      { metodo: 'POST', cuerpo: datos },
    ),
}

// ── flashcards ───────────────────────────────────────────────────────────────
export const tarjetaPublica = z.object({
  id: z.string(),
  orden: z.number(),
  anverso: z.string(),
  reverso: z.string(),
})

export const mazoAdmin = z.object({
  mazoId: z.string(),
  version: z.number(),
  estado: z.string(),
  modeloUsado: z.string().nullable(),
  contenidoHash: z.string(),
  generadoAt: z.string().nullable(),
  tarjetas: z.array(
    z.object({
      id: z.string(),
      orden: z.number(),
      anverso: z.string(),
      reverso: z.string(),
      estado: z.string(),
      editada: z.boolean(),
      motivoRechazo: z.string().nullable(),
    }),
  ),
})

export type TarjetaPublica = z.infer<typeof tarjetaPublica>
export type MazoAdmin = z.infer<typeof mazoAdmin>

export const flashcardsApi = {
  tarjetasDeTomo: (tomoId: string) =>
    llamarOpcional(`/api/flashcards/tomos/${tomoId}`, z.array(tarjetaPublica)),
  mazosAdmin: (tomoId: string) =>
    llamarOpcional(`/api/flashcards/admin/tomos/${tomoId}`, z.array(mazoAdmin)),
  aprobar: (mazoId: string, tarjetaId: string, edicion?: { anverso: string; reverso: string }) =>
    llamar(
      `/api/flashcards/admin/mazos/${mazoId}/tarjetas/${tarjetaId}/aprobar`,
      z.object({ estadoMazo: z.string(), publicadas: z.number() }),
      { metodo: 'POST', ...(edicion ? { cuerpo: edicion } : {}) },
    ),
  rechazar: (mazoId: string, tarjetaId: string, motivo: string) =>
    llamar(
      `/api/flashcards/admin/mazos/${mazoId}/tarjetas/${tarjetaId}/rechazar`,
      z.object({ estadoMazo: z.string(), publicadas: z.number() }),
      { metodo: 'POST', cuerpo: { motivo } },
    ),
}

// ── payments ─────────────────────────────────────────────────────────────────
export const ordenEstado = z.object({
  ordenId: z.string(),
  cursoId: z.string(),
  estado: z.string(),
  monto: z.number(),
  moneda: z.string(),
  comision: z.number().nullable(),
  neto: z.number().nullable(),
})

export type OrdenEstado = z.infer<typeof ordenEstado>

export const paymentsApi = {
  crearOrden: (cursoId: string) =>
    llamar(
      '/api/payments/ordenes',
      z.object({
        ordenId: z.string(),
        urlAprobacion: z.string(),
        monto: z.number(),
        moneda: z.string(),
        reutilizada: z.boolean(),
      }),
      { metodo: 'POST', cuerpo: { cursoId } },
    ),
  misOrdenes: () => llamar('/api/payments/mis-ordenes', z.array(ordenEstado)),
  ordenesAdmin: () => llamar('/api/payments/admin/ordenes', z.array(ordenEstado)),
  estadoOrden: (ordenId: string) => llamarOpcional(`/api/payments/ordenes/${ordenId}`, ordenEstado),
}
