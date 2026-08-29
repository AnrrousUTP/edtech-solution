import type { Result } from '@edtech/shared-kernel'
import type { PasarelaError } from '../module.errors'
import type { Dinero } from '../value-objects/dinero.vo'

export type OrdenPasarela = { proveedorOrdenId: string; urlAprobacion: string }

export type CapturaPasarela = {
  capturaId: string
  montoCapturado: Dinero
  comision: Dinero
  neto: Dinero
  estado: 'COMPLETADA' | 'PENDIENTE' | 'DENEGADA'
}

/** El dominio conoce ESTA interfaz y nada más (doc 09 §1). No sabe qué es
 *  PayPal, ni que existe un webhook, ni que hay una cola. */
export interface PasarelaPagoPort {
  crearOrden(input: {
    ordenId: string // nuestro id → viaja como custom_id, permite conciliar
    monto: Dinero
    descripcion: string
    urlRetorno: string
    urlCancelacion: string
  }): Promise<Result<OrdenPasarela, PasarelaError>>

  capturar(proveedorOrdenId: string): Promise<Result<CapturaPasarela, PasarelaError>>

  verificarFirmaWebhook(headers: Record<string, string>, cuerpoCrudo: string): Promise<boolean>

  reembolsar(
    capturaId: string,
    monto: Dinero,
    motivo: string,
  ): Promise<Result<{ reembolsoId: string }, PasarelaError>>
}
