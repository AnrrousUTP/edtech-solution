import Link from 'next/link'
import { gamificationApi } from '@/api/resto'

// Pantalla 11: verificación PÚBLICA de un certificado. Sin cuenta, sin sesión.
// Nunca expone el usuarioId: solo lo justo para confirmar el certificado.
const VerificarCertificado = async ({
  params,
}: {
  params: Promise<{ codigo: string }>
}): Promise<JSX.Element> => {
  const { codigo } = await params
  const certificado = await gamificationApi.verificar(codigo).catch(() => null)

  if (!certificado) {
    return (
      <div className="tech-certificate-card tarjeta mx-auto max-w-lg border-alerta-500/30 p-10 text-center">
        <p className="text-5xl" aria-hidden="true">
          ⚠️
        </p>
        <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Certificado no encontrado</h1>
        <p className="mt-3 text-slate-600">
          No existe ningún certificado con el código{' '}
          <span className="font-mono font-bold">{codigo}</span>. Revisa que esté completo y sin
          espacios.
        </p>
        <Link href="/" className="boton-secundario mt-6">
          Ir al inicio
        </Link>
      </div>
    )
  }

  return (
    <div className="tech-certificate-card tarjeta mx-auto max-w-lg border-exito-500/40 p-10 text-center">
      <p className="text-5xl" aria-hidden="true">
        ✅
      </p>
      <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Certificado verificado</h1>
      <p className="mt-2 text-sm text-slate-600">
        Este certificado fue emitido por EdTech Solution y es auténtico.
      </p>

      <dl className="mt-8 space-y-4 text-left">
        <div>
          <dt className="text-xs font-bold uppercase text-slate-500">Otorgado a</dt>
          <dd className="mt-0.5 text-lg font-bold text-slate-900">{certificado.nombreTitular}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-slate-500">
            {certificado.tipo === 'MAYOR' ? 'Carrera' : 'Curso'}
          </dt>
          <dd className="mt-0.5 font-bold text-slate-900">{certificado.titulo}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-slate-500">Fecha de emisión</dt>
          <dd className="mt-0.5 text-slate-700">
            {new Date(certificado.emitidoAt).toLocaleDateString('es-PE', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-slate-500">Código</dt>
          <dd className="mt-0.5 font-mono text-slate-700">{codigo.toUpperCase()}</dd>
        </div>
      </dl>

      {certificado.pdfUrl && (
        <a
          href={certificado.pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="boton-primario mt-8"
        >
          Ver el PDF
        </a>
      )}
    </div>
  )
}

export default VerificarCertificado
