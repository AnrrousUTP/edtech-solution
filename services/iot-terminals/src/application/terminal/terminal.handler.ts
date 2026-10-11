import type { TerminalRepository } from '../../domain/ports-out/terminal.repository'
import { validarMensaje } from '../../domain/value-objects/configuracion.vo'
export class TerminalHandler {
  constructor(readonly repositorio: TerminalRepository) {}
  async configurar(
    usuarioId: string,
    mensaje: unknown,
    habilitado: boolean,
    version: number,
  ): Promise<{ actualizado: true }> {
    await this.repositorio.configurar(usuarioId, validarMensaje(mensaje), habilitado, version)
    return { actualizado: true }
  }
}
