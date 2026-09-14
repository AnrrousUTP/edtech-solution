import type { UniqueId } from '@edtech/shared-kernel'
import type { Orden } from '../entities/orden.entity'

export type PrecioProyectado = {
  cursoId: string
  titulo: string
  monto: number
  moneda: string
  versionPrecio: number
  publicado: boolean
}

export interface OrdenRepository {
  porId(id: UniqueId): Promise<Orden | null>
  porPaypalOrderId(paypalOrderId: string): Promise<Orden | null>
  porPaypalCaptureId(capturaId: string): Promise<Orden | null>
  /** Doble clic en "Pagar": se reutiliza la PENDIENTE existente (doc 09 §8). */
  pendienteDe(usuarioId: UniqueId, cursoId: UniqueId): Promise<Orden | null>
  capturadaDe(usuarioId: UniqueId, cursoId: UniqueId): Promise<Orden | null>
  porUsuario(usuarioId: UniqueId): Promise<Orden[]>
  /** Lectura global exclusiva del panel admin; nunca se expone a estudiantes. */
  todas(): Promise<Orden[]>
  guardar(orden: Orden): Promise<void>
  vencidas(ahora: Date): Promise<Orden[]>
}

export interface PrecioProyeccionRepository {
  porCursoId(cursoId: string): Promise<PrecioProyectado | null>
  guardar(precio: PrecioProyectado): Promise<void>
  marcarPublicado(cursoId: string, publicado: boolean): Promise<void>
}

export type WebhookCrudo = {
  paypalEventId: string
  eventType: string
  firmaValida: boolean
  payload: unknown
}

export interface WebhookRepository {
  /** Idempotencia frente a los reintentos de PayPal (doc 09 §4). Devuelve
   *  false si el paypal_event_id ya estaba registrado. */
  registrarSiEsNuevo(webhook: WebhookCrudo): Promise<boolean>
  /** El worker lee de la bitácora: el mensaje de la cola solo lleva el id. */
  porEventId(paypalEventId: string): Promise<WebhookCrudo | null>
  marcarProcesado(paypalEventId: string, error?: string): Promise<void>
}

export interface ColaWebhooks {
  encolar(paypalEventId: string): Promise<void>
}
