import type { SobreEvento } from '@edtech/shared-kernel'
import type { Afiliado, Atribucion } from '../entities/afiliado.entity'
export interface AfiliadosRepository {
  activar(usuarioId: string): Promise<Afiliado>
  porUsuario(usuarioId: string): Promise<Afiliado | null>
  visitar(refId: string, visitaAnterior?: string): Promise<{ visitaId: string; destino: string }>
  atribuir(usuarioId: string, visitaId?: string): Promise<Atribucion | null>
  configurar(usuarioId: string, cursoSlug: string | null): Promise<void>
  resumen(
    usuarioId: string,
    desde?: string,
    hasta?: string,
    cursor?: string,
  ): Promise<Record<string, unknown>>
  notificaciones(usuarioId: string): Promise<Record<string, unknown>[]>
  leerNotificacion(usuarioId: string, id: string): Promise<boolean>
  admin(): Promise<Record<string, unknown>>
  estadoAfiliado(id: string, activo: boolean): Promise<void>
  procesar(sobre: SobreEvento): Promise<void>
}
export interface FirmadorAtribucion {
  firmar(datos: Atribucion): Promise<string>
}
