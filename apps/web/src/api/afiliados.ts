import { z } from 'zod'
import { llamar, llamarOpcional } from '@/lib/api'
export const afiliado = z.object({
  id: z.string(),
  usuarioId: z.string(),
  refId: z.string(),
  activo: z.boolean(),
  cursoSlug: z.string().nullable(),
  creadoAt: z.string(),
})
export const ingreso = z.object({
  id: z.string(),
  ordenId: z.string(),
  cursoTitulo: z.string(),
  baseCentavos: z.number(),
  tasaBps: z.number(),
  originalCentavos: z.number(),
  ingresoCentavos: z.number(),
  estado: z.enum(['REGISTRADA', 'AJUSTADA', 'ANULADA']),
  creadoAt: z.string(),
})
export const resumen = z.object({
  afiliado,
  moneda: z.literal('USD'),
  totalCentavos: z.number(),
  ingresosPeriodoCentavos: z.number(),
  ventas: z.number(),
  visitas: z.number(),
  cursos: z.array(z.object({ id: z.string(), titulo: z.string(), slug: z.string() })),
  historial: z.array(ingreso),
  siguienteCursor: z.string().nullable(),
})
export const notificacion = z.object({
  id: z.string(),
  mensaje: z.string(),
  leida: z.boolean(),
  creadoAt: z.string(),
})
export const terminal = z.object({
  id: z.string(),
  usuarioId: z.string().nullable(),
  refId: z.string().nullable(),
  mensaje: z.string(),
  habilitado: z.boolean(),
  version: z.number(),
  versionReportada: z.number(),
  ultimaConexion: z.string().nullable(),
  conectado: z.boolean(),
  ultimoAviso: z.string().nullable(),
  previewToken: z.string().optional(),
})
export const terminalPublico = terminal.omit({
  usuarioId: true,
  ultimaConexion: true,
  previewToken: true,
})
export const afiliadosApi = {
  yo: () => llamar('/api/affiliates/me', afiliado.nullable()),
  resumen: (query = '') => llamarOpcional(`/api/affiliates/ingresos${query}`, resumen),
  avisos: () => llamar('/api/affiliates/notificaciones', z.array(notificacion)),
  prueba: (visitaId?: string) =>
    llamar('/api/affiliates/atribucion', z.object({ prueba: z.string().nullable() }), {
      metodo: 'POST',
      cuerpo: { visitaId },
    }),
  terminal: () =>
    llamar(
      '/api/iot/me',
      z.object({ terminal: terminal.nullable(), solicitud: z.string().nullable() }),
    ),
  vista: (id: string, token: string) =>
    llamar(
      `/api/iot/vista/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
      terminalPublico,
      { autenticado: false },
    ),
  admin: () =>
    llamar(
      '/api/affiliates/admin',
      z.object({
        afiliados: z.array(afiliado.extend({ ingresosCentavos: z.number(), ventas: z.number() })),
        comisiones: z.array(
          z.object({
            id: z.string(),
            ordenId: z.string(),
            refId: z.string(),
            cursoTitulo: z.string(),
            ingresoCentavos: z.number(),
            baseCentavos: z.number(),
            creadoAt: z.string(),
          }),
        ),
      }),
    ),
  adminTerminales: () =>
    llamar(
      '/api/iot/admin',
      z.object({
        terminales: z.array(terminal),
        afiliados: z.array(
          z.object({
            usuarioId: z.string(),
            refId: z.string(),
            solicitadoAt: z.string().nullable(),
          }),
        ),
      }),
    ),
}
export type Ingreso = z.infer<typeof ingreso>
