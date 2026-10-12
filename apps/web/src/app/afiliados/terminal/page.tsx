import Link from 'next/link'
import QRCode from 'qrcode'
import { afiliadosApi } from '@/api/afiliados'
import { config } from '@/lib/config'
import { Accion, AutoActualizar, ConfigurarTerminal } from '../widgets'
import { TerminalIoT } from './terminal-iot'
export default async function Page(): Promise<JSX.Element> {
  const data = await afiliadosApi.terminal(),
    t = data.terminal,
    link = t?.refId ? new URL(`/r/${t.refId}`, config.appUrl).toString() : null,
    qrDataUrl = link
      ? await QRCode.toDataURL(link, { width: 320, margin: 3, errorCorrectionLevel: 'M' })
      : null
  return (
    <section className="affiliate-card">
      <AutoActualizar />
      <h2>Mi terminal promocional</h2>
      <p>Muestra tu QR y acompaña tus recomendaciones con un mensaje.</p>
      {!t ? (
        <div className="affiliate-empty">
          <h3>{data.solicitud ? 'Solicitud registrada' : 'Todavía no tienes un terminal'}</h3>
          <p>
            {data.solicitud
              ? 'Un administrador asignará el terminal de demostración a tu cuenta.'
              : 'Solicita el terminal de demostración después de activar tu afiliación.'}
          </p>
          {!data.solicitud && <Accion path="terminal/solicitud" texto="Solicitar terminal" />}
        </div>
      ) : (
        <>
          <div className="affiliate-two-cols">
            <div>
              <div className="affiliate-status">
                <span
                  className={`etiqueta ${t.conectado ? 'tech-badge-green' : 'tech-badge-neutral'}`}
                >
                  {t.conectado ? 'Conectado' : 'Desconectado'}
                </span>
                <span className="etiqueta tech-badge-blue">
                  {t.version === t.versionReportada
                    ? 'Configuración aplicada'
                    : 'Esperando sincronización'}
                </span>
              </div>
              <ConfigurarTerminal
                mensaje={t.mensaje}
                habilitado={t.habilitado}
                version={t.version}
              />
            </div>
            <div className="affiliate-terminal-summary">
              <h3>Tu promoción</h3>
              <p>{t.mensaje}</p>
              <p>{t.ultimoAviso ?? 'Los avisos de nuevas ventas aparecerán aquí.'}</p>
              <Link
                href={`/terminales/${t.id}/vista?token=${t.previewToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="boton-secundario"
              >
                Abrir pantalla del terminal
              </Link>
              <p className="affiliate-help">
                La pantalla se actualiza al recibir la configuración. Tus ingresos se siguen
                registrando aunque el terminal esté desconectado.
              </p>
            </div>
          </div>
          <TerminalIoT
            terminalId={t.id}
            thingName={config.iot.thingName}
            qrDataUrl={qrDataUrl}
            mensaje={t.mensaje}
            habilitado={t.habilitado}
            version={t.version}
          />
        </>
      )}
    </section>
  )
}
