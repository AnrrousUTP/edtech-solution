import { redirect } from 'next/navigation'
import { afiliadosApi } from '@/api/afiliados'
import { config } from '@/lib/config'
import { Compartir, DestinoQr } from '../widgets'
export default async function Page(): Promise<JSX.Element> {
  const r = await afiliadosApi.resumen()
  if (!r) redirect('/afiliados')
  const link = new URL(`/r/${r.afiliado.refId}`, config.appUrl).toString()
  return (
    <div className="affiliate-two-cols">
      <section className="affiliate-card affiliate-qr-card">
        <h2>Mi QR personal</h2>
        <p>Tu enlace es permanente y está asociado a tu cuenta.</p>
        <img
          src="/api/afiliados/qr?formato=svg"
          alt="QR de tu enlace personal de afiliado"
          width={280}
          height={280}
          className="affiliate-qr"
        />
        <div className="affiliate-actions">
          <a
            href="/api/afiliados/qr?formato=png"
            download="mi-qr-edtech.png"
            className="boton-secundario"
          >
            Descargar PNG
          </a>
          <a
            href="/api/afiliados/qr?formato=svg"
            download="mi-qr-edtech.svg"
            className="boton-secundario"
          >
            Descargar SVG
          </a>
        </div>
      </section>
      <section className="affiliate-card">
        <h2>Invita a aprender</h2>
        <Compartir url={link} />
        <DestinoQr slug={r.afiliado.cursoSlug} cursos={r.cursos} />
        {!r.afiliado.activo && (
          <p className="affiliate-notice">Tu enlace está pausado y no atribuye nuevas compras.</p>
        )}
        <p className="affiliate-help">
          Se registran visitas al abrir el enlace. La comisión se calcula después de confirmar la
          compra.
        </p>
      </section>
    </div>
  )
}
