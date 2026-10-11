export type Afiliado = {
  id: string
  usuarioId: string
  refId: string
  activo: boolean
  cursoSlug: string | null
  creadoAt: string
}
export type Visita = {
  id: string
  afiliadoId: string
  usuarioId: string | null
  creadoAt: string
  expiraAt: string
}
export type Atribucion = {
  afiliadoId: string
  afiliadoUsuarioId: string
  visitaId: string
  refId: string
  compradorId: string
  politica: 'ultimo-referido-30d-v1'
  tasaBps: 500
}
export type VentaReferida = Atribucion & {
  ordenId: string
  cursoId: string
  cursoTitulo: string
  baseCentavos: number
  moneda: 'USD'
  confirmadoAt: string
}
