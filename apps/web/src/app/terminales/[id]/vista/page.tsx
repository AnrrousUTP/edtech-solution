import QRCode from 'qrcode'
import { afiliadosApi } from '@/api/afiliados'
import { config } from '@/lib/config'
import { ErrorConAccion } from '@/componentes/base'
import { AutoActualizar } from '../../../afiliados/widgets'
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string }>
}): Promise<JSX.Element> {
  if (!config.affiliatesEnabled)
    return (
      <ErrorConAccion
        titulo="Pantalla no disponible"
        detalle="La promoción no está habilitada."
        accion={{ texto: 'Explorar cursos', href: '/cursos' }}
      />
    )
  const { id } = await params,
    { token } = await searchParams
  const t = await afiliadosApi.vista(id, token ?? '').catch(() => null)
  if (!t)
    return (
      <ErrorConAccion
        titulo="Pantalla no disponible"
        detalle="Este enlace de vista previa no está activo."
        accion={{ texto: 'Explorar cursos', href: '/cursos' }}
      />
    )
  const aplicado = t.version === t.versionReportada,
    link = t.refId ? new URL(`/r/${t.refId}`, config.appUrl).toString() : null
  const qr =
    link && aplicado
      ? await QRCode.toDataURL(link, { width: 512, margin: 4, errorCorrectionLevel: 'M' })
      : null
  return (
    <section className="affiliate-display">
      <AutoActualizar />
      <p className="affiliate-eyebrow">Una nueva habilidad empieza aquí</p>
      <h1>{t.mensaje}</h1>
      <p>Escanea el QR y descubre tu próximo curso.</p>
      {t.habilitado && qr ? (
        <>
          <img
            src={qr}
            alt="QR de la promoción EdTech"
            width={320}
            height={320}
            className="affiliate-qr"
          />
          <a href={link!} className="boton-primario">
            Explorar cursos
          </a>
        </>
      ) : (
        <p className="affiliate-notice">
          {!aplicado ? 'Esperando la configuración del terminal…' : 'La promoción está pausada.'}
        </p>
      )}
      <div className="affiliate-status">
        <span className="etiqueta tech-badge-neutral">
          {t.conectado ? 'Terminal conectado' : 'Terminal desconectado'}
        </span>
        {t.ultimoAviso && <span className="etiqueta tech-badge-green">{t.ultimoAviso}</span>}
      </div>
    </section>
  )
}
