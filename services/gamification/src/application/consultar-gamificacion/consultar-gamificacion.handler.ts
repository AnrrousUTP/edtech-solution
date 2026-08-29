import {
  Err,
  Ok,
  UniqueId,
  isErr,
  type Query,
  type QueryHandler,
  type Result,
} from '@edtech/shared-kernel'
import { CertificadoNoEncontradoError, type GamificationError } from '../../domain/module.errors'
import type { CertificadoRepository } from '../../domain/ports-out/certificado.repository'
import type { PerfilRepository } from '../../domain/ports-out/perfil.repository'
import type { AlmacenPdf } from '../../domain/ports-out/pdf.port'
import { CodigoVerificacion } from '../../domain/value-objects/codigo-verificacion.vo'

export type MiPerfilQuery = Query & { readonly _tag: 'MiPerfil'; readonly usuarioId: string }

export type PerfilResponse = {
  usuarioId: string
  puntos: number
  rachaActual: number
  rachaMaxima: number
  ultimaActividad: string | null
  insignias: { criterio: string; referenciaId: string; otorgadaAt: string }[]
  certificados: {
    id: string
    tipo: string
    titulo: string
    codigoVerificacion: string
    pdfDisponible: boolean
    emitidoAt: string
  }[]
}

export class MiPerfilHandler implements QueryHandler<
  MiPerfilQuery,
  PerfilResponse,
  GamificationError
> {
  readonly handles = 'MiPerfil' as const

  constructor(
    private readonly perfiles: PerfilRepository,
    private readonly certificados: CertificadoRepository,
  ) {}

  async execute(q: MiPerfilQuery): Promise<Result<PerfilResponse, GamificationError>> {
    const usuarioId = UniqueId.desde(q.usuarioId)
    const perfil = await this.perfiles.porUsuario(usuarioId)
    const certificados = await this.certificados.porUsuario(usuarioId)

    return Ok({
      usuarioId: q.usuarioId,
      puntos: perfil?.puntos ?? 0,
      rachaActual: perfil?.rachaActual ?? 0,
      rachaMaxima: perfil?.rachaMaxima ?? 0,
      ultimaActividad: perfil?.ultimaActividad?.toISOString() ?? null,
      insignias: (perfil?.insignias ?? []).map(i => ({
        criterio: i.criterio,
        referenciaId: i.referenciaId,
        otorgadaAt: i.otorgadaAt.toISOString(),
      })),
      certificados: certificados.map(c => ({
        id: c.id.valor,
        tipo: c.tipo,
        titulo: c.titulo,
        codigoVerificacion: c.codigo.valor,
        pdfDisponible: c.pdfS3Key !== null,
        emitidoAt: c.emitidoAt.toISOString(),
      })),
    })
  }
}

export type VerificarCertificadoQuery = Query & {
  readonly _tag: 'VerificarCertificado'
  readonly codigo: string
}

export type VerificacionResponse = {
  valido: true
  tipo: string
  titulo: string
  nombreTitular: string
  emitidoAt: string
  pdfUrl: string | null
}

/** Verificación PÚBLICA (sin cuenta): pantalla 11 del doc 11. Devuelve lo
 *  justo para confirmar el certificado, nunca el usuarioId. */
export class VerificarCertificadoHandler implements QueryHandler<
  VerificarCertificadoQuery,
  VerificacionResponse,
  GamificationError
> {
  readonly handles = 'VerificarCertificado' as const

  constructor(
    private readonly certificados: CertificadoRepository,
    private readonly almacen: AlmacenPdf,
  ) {}

  async execute(
    q: VerificarCertificadoQuery,
  ): Promise<Result<VerificacionResponse, GamificationError>> {
    const codigo = CodigoVerificacion.crear(q.codigo)
    if (isErr(codigo)) return Err(codigo.error)

    const certificado = await this.certificados.porCodigo(codigo.value.valor)
    if (!certificado) return Err(new CertificadoNoEncontradoError(q.codigo))

    return Ok({
      valido: true,
      tipo: certificado.tipo,
      titulo: certificado.titulo,
      nombreTitular: certificado.nombreTitular,
      emitidoAt: certificado.emitidoAt.toISOString(),
      pdfUrl: certificado.pdfS3Key
        ? await this.almacen.urlFirmada(certificado.pdfS3Key, 300)
        : null,
    })
  }
}
