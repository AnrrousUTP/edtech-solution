import type { Certificado } from '../entities/certificado.entity'

/** El PDF tarda segundos: se genera en un worker por cola interna (doc 05 §1). */
export interface GeneradorPdf {
  generar(certificado: Certificado): Promise<Uint8Array>
}

export interface AlmacenPdf {
  guardar(certificadoId: string, pdf: Uint8Array): Promise<string>
  /** URL firmada de duración corta (doc 07 §10). */
  urlFirmada(key: string, segundos: number): Promise<string>
}

export interface ColaCertificados {
  encolar(certificadoId: string): Promise<void>
}
