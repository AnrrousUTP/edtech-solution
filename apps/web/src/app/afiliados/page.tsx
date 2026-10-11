import { redirect } from 'next/navigation'
import { afiliadosApi } from '@/api/afiliados'
import { Accion } from './widgets'
export default async function Page(): Promise<JSX.Element> {
  const a = await afiliadosApi.yo()
  if (a) redirect('/afiliados/panel')
  return (
    <section className="affiliate-card affiliate-intro">
      <div>
        <span className="etiqueta tech-badge-blue">Tu recomendación tiene valor</span>
        <h2>
          Comparte cursos.
          <br />
          Registra tus ingresos.
        </h2>
        <p>
          Obtén tu QR personal, compártelo y recibe una comisión del 5% cuando alguien compre un
          curso desde tu enlace.
        </p>
        <Accion path="activar" texto="Obtener mi QR" />
      </div>
      <ol className="affiliate-steps">
        <li>
          <strong>1. Activa tu participación</strong>
          <span>Tu cuenta tendrá un enlace personal permanente.</span>
        </li>
        <li>
          <strong>2. Comparte tu QR</strong>
          <span>La persona explora EdTech y elige qué aprender.</span>
        </li>
        <li>
          <strong>3. Consulta tus ingresos</strong>
          <span>Una venta de USD 40 registra USD 2 y una notificación.</span>
        </li>
      </ol>
    </section>
  )
}
