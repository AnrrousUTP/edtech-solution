import { AggregateRoot, UniqueId } from '@edtech/shared-kernel'
import { CertificadoEmitidoEvent } from '../events/certificado-emitido.event'
import type { CodigoVerificacion } from '../value-objects/codigo-verificacion.vo'

export type TipoCertificado = 'MENOR' | 'MAYOR'

type Props = {
  id: UniqueId
  usuarioId: UniqueId
  tipo: TipoCertificado
  referenciaId: string
  titulo: string
  nombreTitular: string // congelado al emitir
  codigo: CodigoVerificacion
  pdfS3Key: string | null
  emitidoAt: Date
}

/** Un certificado emitido es inmutable (doc 02 §5.4). Lo único que cambia
 *  después es la clave del PDF, que el worker rellena de forma asíncrona. */
export class Certificado extends AggregateRoot {
  private constructor(private readonly props: Props) {
    super()
  }

  static emitir(datos: {
    usuarioId: UniqueId
    tipo: TipoCertificado
    referenciaId: string
    titulo: string
    nombreTitular: string
    codigo: CodigoVerificacion
    ahora: Date
  }): Certificado {
    const c = new Certificado({
      id: UniqueId.nuevo(),
      usuarioId: datos.usuarioId,
      tipo: datos.tipo,
      referenciaId: datos.referenciaId,
      titulo: datos.titulo,
      nombreTitular: datos.nombreTitular,
      codigo: datos.codigo,
      pdfS3Key: null,
      emitidoAt: datos.ahora,
    })
    c.record(
      new CertificadoEmitidoEvent(
        c.props.id.valor,
        datos.usuarioId.valor,
        datos.tipo,
        datos.referenciaId,
        datos.titulo,
        datos.codigo.valor,
      ),
    )
    return c
  }

  static reconstruir(props: Props): Certificado {
    return new Certificado(props)
  }

  adjuntarPdf(key: string): void {
    this.props.pdfS3Key = key
  }

  get id(): UniqueId {
    return this.props.id
  }
  get usuarioId(): UniqueId {
    return this.props.usuarioId
  }
  get tipo(): TipoCertificado {
    return this.props.tipo
  }
  get referenciaId(): string {
    return this.props.referenciaId
  }
  get titulo(): string {
    return this.props.titulo
  }
  get nombreTitular(): string {
    return this.props.nombreTitular
  }
  get codigo(): CodigoVerificacion {
    return this.props.codigo
  }
  get pdfS3Key(): string | null {
    return this.props.pdfS3Key
  }
  get emitidoAt(): Date {
    return this.props.emitidoAt
  }
}
