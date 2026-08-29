import {
  Err,
  Ok,
  UniqueId,
  type Command,
  type CommandHandler,
  type Result,
} from '@edtech/shared-kernel'
import { CertificadoNoEncontradoError, type GamificationError } from '../../domain/module.errors'
import type { CertificadoRepository } from '../../domain/ports-out/certificado.repository'
import type { AlmacenPdf, GeneradorPdf } from '../../domain/ports-out/pdf.port'

export type GenerarPdfCommand = Command & {
  readonly _tag: 'GenerarPdf'
  readonly certificadoId: string
}

/** Worker de la cola interna `sqs-gamification-certificados` (doc 05 §1):
 *  generar el PDF tarda segundos y no debe bloquear al consumidor de eventos.
 *  Idempotente: si el PDF ya está, no se regenera. */
export class GenerarPdfHandler implements CommandHandler<
  GenerarPdfCommand,
  { key: string },
  GamificationError
> {
  readonly handles = 'GenerarPdf' as const

  constructor(
    private readonly certificados: CertificadoRepository,
    private readonly generador: GeneradorPdf,
    private readonly almacen: AlmacenPdf,
  ) {}

  async execute(cmd: GenerarPdfCommand): Promise<Result<{ key: string }, GamificationError>> {
    const certificado = await this.certificados.porId(UniqueId.desde(cmd.certificadoId))
    if (!certificado) return Err(new CertificadoNoEncontradoError(cmd.certificadoId))
    if (certificado.pdfS3Key) return Ok({ key: certificado.pdfS3Key })

    const pdf = await this.generador.generar(certificado)
    const key = await this.almacen.guardar(certificado.id.valor, pdf)
    certificado.adjuntarPdf(key)
    await this.certificados.guardar(certificado)
    return Ok({ key })
  }
}
