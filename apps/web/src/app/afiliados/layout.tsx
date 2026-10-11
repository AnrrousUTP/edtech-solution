import Link from 'next/link'
import { redirect } from 'next/navigation'
import { accessToken } from '@/lib/sesion'
import { config } from '@/lib/config'
import { ErrorConAccion } from '@/componentes/base'
export default async function Layout({
  children,
}: {
  children: React.ReactNode
}): Promise<JSX.Element> {
  if (!config.affiliatesEnabled)
    return (
      <ErrorConAccion
        titulo="Programa de afiliados no disponible"
        detalle="Esta función aún no está habilitada en este entorno."
        accion={{ texto: 'Ver cursos', href: '/cursos' }}
      />
    )
  if (!(await accessToken())) redirect('/login?destino=/afiliados')
  return (
    <div className="affiliate-shell">
      <div className="affiliate-heading">
        <div>
          <p className="affiliate-eyebrow">Comparte lo que aprendes</p>
          <h1>Programa de afiliados</h1>
          <p>Tu recomendación puede abrir una nueva oportunidad.</p>
        </div>
        <span className="affiliate-rate">5% por venta</span>
      </div>
      <nav className="affiliate-nav" aria-label="Programa de afiliados">
        <Link href="/afiliados/panel">Resumen</Link>
        <Link href="/afiliados/qr">Mi QR</Link>
        <Link href="/afiliados/ingresos">Ingresos</Link>
        <Link href="/afiliados/notificaciones">Notificaciones</Link>
        <Link href="/afiliados/terminal">Terminal</Link>
      </nav>
      {children}
    </div>
  )
}
