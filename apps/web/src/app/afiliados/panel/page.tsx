import Link from 'next/link'
import { redirect } from 'next/navigation'
import { afiliadosApi } from '@/api/afiliados'
import { AutoActualizar } from '../widgets'
import { dinero, Historial } from '../datos'
export default async function Page(): Promise<JSX.Element> {
  const [r, avisos] = await Promise.all([afiliadosApi.resumen(), afiliadosApi.avisos()])
  if (!r) redirect('/afiliados')
  const conversion = r.visitas ? Math.round((r.ventas / r.visitas) * 1000) / 10 : 0
  return (
    <>
      <AutoActualizar />
      {!r.afiliado.activo && (
        <p className="affiliate-notice">
          Tu participación está pausada. Puedes consultar el historial de tus ingresos.
        </p>
      )}
      <div className="affiliate-metrics">
        <section className="affiliate-card affiliate-income">
          <p>Ingresos</p>
          <strong>{dinero(r.totalCentavos)}</strong>
          <span>Comisiones registradas por tus recomendaciones</span>
        </section>
        <section className="affiliate-card">
          <p>Ventas referidas</p>
          <strong>{r.ventas}</strong>
          <span>Compras confirmadas</span>
        </section>
        <section className="affiliate-card">
          <p>Visitas a tu enlace</p>
          <strong>{r.visitas}</strong>
          <span>{conversion}% de conversión</span>
        </section>
      </div>
      <section className="affiliate-card affiliate-callout">
        <div>
          <h2>Tu próxima recomendación empieza aquí</h2>
          <p>Comparte tu QR personal por mensaje, en redes o en una conversación.</p>
        </div>
        <Link href="/afiliados/qr" className="boton-primario">
          Ver mi QR
        </Link>
      </section>
      {avisos
        .filter(n => !n.leida)
        .slice(0, 3)
        .map(n => (
          <Link key={n.id} href="/afiliados/notificaciones" className="affiliate-notice">
            {n.mensaje}
          </Link>
        ))}
      <section className="affiliate-card">
        <div className="affiliate-section-head">
          <h2>Últimos ingresos</h2>
          <Link href="/afiliados/ingresos">Ver historial</Link>
        </div>
        <Historial filas={r.historial.slice(0, 5)} />
      </section>
    </>
  )
}
