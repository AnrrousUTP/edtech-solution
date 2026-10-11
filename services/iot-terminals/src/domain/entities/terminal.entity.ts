export type TerminalConfig = {
  version: number
  refId: string | null
  mensaje: string
  habilitado: boolean
}
export type Terminal = {
  id: string
  usuarioId: string | null
  refId: string | null
  mensaje: string
  habilitado: boolean
  version: number
  versionReportada: number
  ultimaConexion: string | null
  conectado: boolean
  ultimoAviso: string | null
  previewToken?: string
}
