import Link from 'next/link'
import { afiliadosApi } from '@/api/afiliados'
import { esAdmin, mfaPendiente } from '@/lib/sesion'
import { config } from '@/lib/config'
import { ErrorConAccion } from '@/componentes/base'
import { dinero, fecha } from '../../afiliados/datos'
import { AutoActualizar } from '../../afiliados/widgets'
export default async function Page(): Promise<JSX.Element> {
  if (!config.affiliatesEnabled || !(await esAdmin()) || (await mfaPendiente()))
    return (
      <ErrorConAccion
        titulo="Acceso administrativo requerido"
        detalle="Esta sección requiere una cuenta administradora habilitada."
        accion={{ texto: 'Iniciar sesión', href: '/admin/login' }}
      />
    )
  const data = await afiliadosApi.admin()
  return (
    <div className="affiliate-shell">
      <AutoActualizar />
      <div className="affiliate-section-head">
        <h1>Comisiones registradas</h1>
        <Link href="/admin/afiliados">Ver afiliados</Link>
      </div>
      <section className="affiliate-card">
        <div className="affiliate-table-wrap">
          <table className="affiliate-table">
            <thead>
              <tr>
                <th>Curso</th>
                <th>Afiliado</th>
                <th>Venta</th>
                <th>Comisión neta</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {data.comisiones.map(c => (
                <tr key={c.id}>
                  <td>{c.cursoTitulo}</td>
                  <td>{c.refId.slice(0, 8)}</td>
                  <td>{dinero(c.baseCentavos)}</td>
                  <td>{dinero(c.ingresoCentavos)}</td>
                  <td>{fecha(c.creadoAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.comisiones.length && (
          <p className="affiliate-empty">Las ventas referidas aparecerán aquí.</p>
        )}
      </section>
    </div>
  )
}
