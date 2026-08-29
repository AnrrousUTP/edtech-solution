import type { UniqueId } from '@edtech/shared-kernel'
import type { Certificado, TipoCertificado } from '../domain/entities/certificado.entity'
import type { PerfilGamificacion } from '../domain/entities/perfil-gamificacion.entity'
import type { CertificadoRepository } from '../domain/ports-out/certificado.repository'
import type { PerfilRepository } from '../domain/ports-out/perfil.repository'
import type { AlmacenPdf, ColaCertificados, GeneradorPdf } from '../domain/ports-out/pdf.port'

export class InMemoryPerfilRepository implements PerfilRepository {
  readonly perfiles = new Map<string, PerfilGamificacion>()

  async porUsuario(usuarioId: UniqueId): Promise<PerfilGamificacion | null> {
    return this.perfiles.get(usuarioId.valor) ?? null
  }
  async guardar(perfil: PerfilGamificacion): Promise<void> {
    this.perfiles.set(perfil.usuarioId.valor, perfil)
  }
}

export class InMemoryCertificadoRepository implements CertificadoRepository {
  readonly certificados = new Map<string, Certificado>()

  async porId(id: UniqueId): Promise<Certificado | null> {
    return this.certificados.get(id.valor) ?? null
  }
  async porCodigo(codigo: string): Promise<Certificado | null> {
    return [...this.certificados.values()].find(c => c.codigo.valor === codigo) ?? null
  }
  async porReferencia(
    usuarioId: UniqueId,
    tipo: TipoCertificado,
    referenciaId: string,
  ): Promise<Certificado | null> {
    return (
      [...this.certificados.values()].find(
        c =>
          c.usuarioId.valor === usuarioId.valor &&
          c.tipo === tipo &&
          c.referenciaId === referenciaId,
      ) ?? null
    )
  }
  async porUsuario(usuarioId: UniqueId): Promise<Certificado[]> {
    return [...this.certificados.values()].filter(c => c.usuarioId.valor === usuarioId.valor)
  }
  async guardar(certificado: Certificado): Promise<void> {
    this.certificados.set(certificado.id.valor, certificado)
  }
}

export class FakeColaCertificados implements ColaCertificados {
  readonly encolados: string[] = []
  async encolar(certificadoId: string): Promise<void> {
    this.encolados.push(certificadoId)
  }
}

export class FakeAlmacenPdf implements AlmacenPdf {
  readonly guardados = new Map<string, Uint8Array>()
  async guardar(certificadoId: string, pdf: Uint8Array): Promise<string> {
    const key = `certificados/${certificadoId}.pdf`
    this.guardados.set(key, pdf)
    return key
  }
  async urlFirmada(key: string): Promise<string> {
    return `https://fake-s3/${key}?firma=abc`
  }
}

export class FakeGeneradorPdf implements GeneradorPdf {
  llamadas = 0
  async generar(): Promise<Uint8Array> {
    this.llamadas += 1
    return new TextEncoder().encode('%PDF-1.4 fake')
  }
}

/** Aleatorio determinista para que los códigos sean reproducibles en test. */
export const aleatorioFijo = (semilla = 1): (() => number) => {
  let s = semilla
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31
    return s / 2 ** 31
  }
}
