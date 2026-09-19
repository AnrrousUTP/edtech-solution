import Link from 'next/link'
import { gamificationApi } from '@/api/resto'
import EdtechLogo from '@/componentes/edtech-logo'

const VistaPreviaCertificado = async ({
  params,
}: {
  params: Promise<{ codigo: string }>
}): Promise<JSX.Element> => {
  const { codigo } = await params
  const codigoNormalizado = codigo.trim().toUpperCase()
  const certificado = await gamificationApi.verificar(codigoNormalizado).catch(() => null)

  if (!certificado) {
    return (
      <div className="tech-certificate-card tarjeta mx-auto max-w-lg border-alerta-500/30 p-10 text-center">
        <svg className="certificate-status-icon is-error" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="18" />
          <path d="M24 14v12M24 32v2" />
        </svg>
        <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Certificado no encontrado</h1>
        <Link href="/" className="boton-secundario mt-6">
          Ir al inicio
        </Link>
      </div>
    )
  }

  return (
    <div className="certificate-preview-page">
      <article className="certificate-preview" aria-label="Vista previa del certificado">
        <div className="certificate-preview__corner certificate-preview__corner--top" />
        <div className="certificate-preview__corner certificate-preview__corner--bottom" />
        <header className="certificate-preview__brand">
          <EdtechLogo className="certificate-preview__logo" />
          <div className="certificate-preview__classification" aria-label="Tipo de documento">
            <span>Certificado oficial</span>
            <span>Validación digital</span>
          </div>
        </header>

        <div className="certificate-preview__content">
          <div className="certificate-preview__title-line" aria-hidden="true">
            <span />
            <span>Reconocimiento académico</span>
            <span />
          </div>
          <h1>Certificado de finalización</h1>
          <p className="certificate-preview__lead">Se certifica que</p>
          <p className="certificate-preview__name">{certificado.nombreTitular}</p>
          <p className="certificate-preview__copy">completó satisfactoriamente el curso</p>
          <p className="certificate-preview__course">{certificado.titulo}</p>
          <div className="certificate-preview__recognition">
            <div className="certificate-preview__signature">
              <svg
                className="certificate-preview__signature-mark"
                viewBox="0 0 160 44"
                aria-hidden="true"
              >
                <path d="M6 29C16 8 23 36 35 21S54 11 62 25c8 13 18 5 25-7 6-10 12-1 7 11-4 12 14 6 22-5 9-12 20-10 35-2" />
              </svg>
              <span />
              <small>Dirección académica</small>
            </div>
            <span className="certificate-preview__seal" aria-label="Certificado validado">
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <circle cx="24" cy="24" r="18" />
                <path d="m14 24 7 7 14-15" />
              </svg>
            </span>
            <div className="certificate-preview__signature">
              <svg
                className="certificate-preview__signature-mark certificate-preview__signature-mark--edtech"
                viewBox="0 0 160 44"
                aria-hidden="true"
              >
                <path d="M7 30c12-21 19-19 25-2 5 14 13 10 17-5 4-14 12-16 13-2 1 13 10 15 19 3 9-13 14-9 13 4-1 12 13 10 24-2 9-10 18-8 35 1" />
              </svg>
              <span />
              <small>EdTech</small>
            </div>
          </div>
        </div>

        <footer className="certificate-preview__footer">
          <div>
            <span>Fecha de emisión</span>
            <strong>
              {new Date(certificado.emitidoAt).toLocaleDateString('es-PE', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </strong>
          </div>
          <div>
            <span>Código de verificación</span>
            <strong className="font-mono">{codigoNormalizado}</strong>
          </div>
          <div>
            <span>Documento verificable</span>
            <strong>edtech.local/certificados</strong>
          </div>
        </footer>
      </article>

      <div className="certificate-preview__actions">
        <a
          href={`/api/certificados/${encodeURIComponent(codigoNormalizado)}/pdf`}
          download={`certificado-${codigoNormalizado}.pdf`}
          className="boton-primario"
        >
          <svg className="inline-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v12M7 10l5 5 5-5M5 20h14" />
          </svg>
          Descargar PDF
        </a>
        <Link
          href={`/certificados/${encodeURIComponent(codigoNormalizado)}`}
          className="boton-secundario"
        >
          Volver a la verificación
        </Link>
        <p>
          Esta vista previa permite revisar el certificado aunque el visor PDF del navegador no esté
          disponible.
        </p>
      </div>
    </div>
  )
}

export default VistaPreviaCertificado
