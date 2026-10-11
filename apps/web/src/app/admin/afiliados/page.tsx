import Link from 'next/link'
import { afiliadosApi } from '@/api/afiliados'
import { esAdmin, mfaPendiente } from '@/lib/sesion'
import { config } from '@/lib/config'
import { ErrorConAccion } from '@/componentes/base'
import { Accion, AutoActualizar } from '../../afiliados/widgets'
import { dinero } from '../../afiliados/datos'
export default async function Page(): Promise<JSX.Element> {
  if (!config.affiliatesEnabled || !(await esAdmin()) || (await mfaPendiente()))
    return (
      <ErrorConAccion
        titulo="Acceso administrativo requerido"
        detalle="Inicia sesión con una cuenta administradora habilitada."
        accion={{ texto: 'Iniciar sesión', href: '/admin/login' }}
      />
    )
  const data = await afiliadosApi.admin()
  return (
    <div className="affiliate-shell">
      <AutoActualizar />
      <div className="affiliate-section-head">
        <div>
          <p className="affiliate-eyebrow">Administración</p>
          <h1>Afiliados</h1>
          <p>Revisa recomendaciones, ventas e ingresos registrados.</p>
        </div>
        <Link className="boton-secundario" href="/admin/terminales">
          Terminales
        </Link>
      </div>
      <section className="affiliate-card">
        <div className="affiliate-table-wrap">
          <table className="affiliate-table">
            <thead>
              <tr>
                <th>Afiliado</th>
                <th>Ventas</th>
                <th>Ingresos</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {data.afiliados.map(a => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.refId.slice(0, 8)}</strong>
                  </td>
                  <td>{a.ventas}</td>
                  <td>{dinero(a.ingresosCentavos)}</td>
                  <td>{a.activo ? 'Activo' : 'Pausado'}</td>
                  <td>
                    <Accion
                      secondary
                      path={`admin/afiliados/${a.id}`}
                      method="PUT"
                      body={{ activo: !a.activo }}
                      texto={a.activo ? 'Pausar' : 'Reactivar'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.afiliados.length && <p className="affiliate-empty">Todavía no hay afiliados.</p>}
      </section>
      <Link href="/admin/comisiones" className="boton-secundario">
        Ver comisiones por venta
      </Link>
    </div>
  )
}
