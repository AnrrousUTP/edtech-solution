import type { SobreEvento } from '@edtech/shared-kernel'
import type { Terminal, TerminalConfig } from '../entities/terminal.entity'
export interface TerminalRepository {
  solicitar(usuarioId: string): Promise<void>
  mio(usuarioId: string): Promise<{ terminal: Terminal | null; solicitud: string | null }>
  configurar(
    usuarioId: string,
    mensaje: string,
    habilitado: boolean,
    version: number,
  ): Promise<void>
  asignar(usuarioId: string | null): Promise<void>
  admin(): Promise<Record<string, unknown>>
  vista(
    id: string,
    token: string,
  ): Promise<
    Pick<
      Terminal,
      | 'id'
      | 'refId'
      | 'mensaje'
      | 'habilitado'
      | 'conectado'
      | 'ultimoAviso'
      | 'version'
      | 'versionReportada'
    >
  >
  procesar(sobre: SobreEvento): Promise<void>
  configuracion(): Promise<TerminalConfig>
  alertas(): Promise<{ id: string; texto: string }[]>
}
