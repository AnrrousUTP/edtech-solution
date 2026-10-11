import Link from 'next/link'
import { afiliadosApi } from '@/api/afiliados'
import { esAdmin, mfaPendiente } from '@/lib/sesion'
import { config } from '@/lib/config'
import { ErrorConAccion } from '@/componentes/base'
import { AutoActualizar, AsignarTerminal } from '../../afiliados/widgets'
export default async function Page(): Promise<JSX.Element> {
  if (!config.affiliatesEnabled || !(await esAdmin()) || (await mfaPendiente()))
    return (
      <ErrorConAccion
        titulo="Acceso administrativo requerido"
        detalle="Esta sección requiere una cuenta administradora habilitada."
        accion={{ texto: 'Iniciar sesión', href: '/admin/login' }}
      />
    )
  const data = await afiliadosApi.adminTerminales(),
    t = data.terminales[0]
  return (
    <div className="affiliate-shell">
      <AutoActualizar />
      <div className="affiliate-section-head">
        <div>
          <h1>Terminal promocional</h1>
          <p>Asigna el dispositivo virtual para la demostración.</p>
        </div>
        <Link href="/admin/afiliados">Ver afiliados</Link>
      </div>
      <section className="affiliate-card">
        <div className="affiliate-two-cols">
          <div>
            <h2>{t?.id ?? 'Sin terminal'}</h2>
            <p className="affiliate-notice">
              {t?.conectado ? 'El terminal está conectado' : 'El terminal está desconectado'}
            </p>
            <p>{data.afiliados.filter(a => a.solicitadoAt).length} solicitudes registradas</p>
            <p className="affiliate-help">
              Cambiar la asignación revoca la vista anterior y actualiza el QR del terminal.
            </p>
          </div>
          <AsignarTerminal afiliados={data.afiliados} usuarioId={t?.usuarioId ?? null} />
        </div>
      </section>
    </div>
  )
}
