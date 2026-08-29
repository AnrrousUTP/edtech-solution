import type { UniqueId } from '@edtech/shared-kernel'
import type { Certificado, TipoCertificado } from '../entities/certificado.entity'

export interface CertificadoRepository {
  porId(id: UniqueId): Promise<Certificado | null>
  porCodigo(codigo: string): Promise<Certificado | null>
  /** Unicidad (usuario, tipo, referencia): un curso da UN certificado. */
  porReferencia(
    usuarioId: UniqueId,
    tipo: TipoCertificado,
    referenciaId: string,
  ): Promise<Certificado | null>
  porUsuario(usuarioId: UniqueId): Promise<Certificado[]>
  guardar(certificado: Certificado): Promise<void>
}
