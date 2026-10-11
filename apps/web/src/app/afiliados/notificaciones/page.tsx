import { afiliadosApi } from '@/api/afiliados'
import { fecha } from '../datos'
import { Accion, AutoActualizar } from '../widgets'
export default async function Page(): Promise<JSX.Element> {
  const avisos = await afiliadosApi.avisos()
  return (
    <section className="affiliate-card">
      <AutoActualizar />
      <h2>Notificaciones</h2>
      <p>Tus ventas y ajustes, en un solo lugar.</p>
      {!avisos.length ? (
        <div className="affiliate-empty">
          <h3>Aún no tienes notificaciones</h3>
          <p>Te avisaremos cuando se confirme una venta desde tu enlace.</p>
        </div>
      ) : (
        <ul className="affiliate-notifications">
          {avisos.map(n => (
            <li key={n.id}>
              <div>
                <strong>{n.mensaje}</strong>
                <small>
                  {fecha(n.creadoAt)} · {n.leida ? 'Leída' : 'Nueva'}
                </small>
              </div>
              {!n.leida && (
                <Accion secondary path={`notificaciones/${n.id}/leida`} texto="Marcar como leída" />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
