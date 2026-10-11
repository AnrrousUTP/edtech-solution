import { Err, Ok, type Result } from '@edtech/shared-kernel'
import { PasarelaError } from '../../../domain/module.errors'
import type {
  CapturaPasarela,
  OrdenPasarela,
  PasarelaPagoPort,
} from '../../../domain/ports-out/pasarela-pago.port'
import { Dinero } from '../../../domain/value-objects/dinero.vo'

/** Pasarela determinista para el entorno local. Nunca se usa en AWS. */
export class PaypalLocalGateway implements PasarelaPagoPort {
  private readonly ordenes = new Map<string, Dinero>()

  async crearOrden(input: {
    ordenId: string
    monto: Dinero
    descripcion: string
    urlRetorno: string
    urlCancelacion: string
  }): Promise<Result<OrdenPasarela, PasarelaError>> {
    void input.descripcion
    void input.urlCancelacion

    const proveedorOrdenId = `LOCAL-PAYPAL-${input.ordenId.slice(0, 8)}`
    this.ordenes.set(proveedorOrdenId, input.monto)

    const retorno = new URL(input.urlRetorno)
    retorno.searchParams.set('orden', input.ordenId)
    retorno.searchParams.set('pago', 'local')

    return Ok({ proveedorOrdenId, urlAprobacion: retorno.toString() })
  }

  async capturar(proveedorOrdenId: string): Promise<Result<CapturaPasarela, PasarelaError>> {
    const monto = this.ordenes.get(proveedorOrdenId)
    if (!monto) return Err(new PasarelaError(`orden local inexistente: ${proveedorOrdenId}`))

    return Ok({
      capturaId: `LOCAL-CAPTURE-${proveedorOrdenId.slice(-8)}`,
      montoCapturado: monto,
      comision: Dinero.desdeCentavos(0, monto.moneda),
      neto: monto,
      estado: 'COMPLETADA',
    })
  }

  async verificarFirmaWebhook(
    headers: Record<string, string>,
    _cuerpoCrudo: string,
  ): Promise<boolean> {
    return headers['paypal-transmission-sig'] === 'local'
  }

  async reembolsar(
    capturaId: string,
    _monto: Dinero,
    _motivo: string,
  ): Promise<Result<{ reembolsoId: string }, PasarelaError>> {
    return Ok({ reembolsoId: `LOCAL-REFUND-${capturaId.slice(-8)}` })
  }
}
