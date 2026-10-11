import Link from 'next/link'
import { redirect } from 'next/navigation'
import { afiliadosApi } from '@/api/afiliados'
import { dinero, Historial } from '../datos'
import { AutoActualizar } from '../widgets'
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; cursor?: string }>
}): Promise<JSX.Element> {
  const p = await searchParams,
    q = new URLSearchParams()
  for (const key of ['desde', 'hasta', 'cursor'] as const)
    if (typeof p[key] === 'string' && p[key]) q.set(key, p[key]!)
  const r = await afiliadosApi.resumen(q.size ? `?${q}` : '')
  if (!r) redirect('/afiliados')
  const next = new URLSearchParams(q)
  if (r.siguienteCursor) next.set('cursor', r.siguienteCursor)
  return (
    <>
      <AutoActualizar />
      <section className="affiliate-card">
        <div className="affiliate-section-head">
          <div>
            <h2>Ingresos</h2>
            <p>El detalle de tus comisiones por cada venta.</p>
          </div>
          <strong className="affiliate-total">{dinero(r.totalCentavos)}</strong>
        </div>
        <form className="affiliate-filter" action="/afiliados/ingresos">
          <div>
            <label htmlFor="ingresos-desde">Desde</label>
            <input id="ingresos-desde" name="desde" type="date" defaultValue={p.desde} />
          </div>
          <div>
            <label htmlFor="ingresos-hasta">Hasta</label>
            <input id="ingresos-hasta" name="hasta" type="date" defaultValue={p.hasta} />
          </div>
          <button className="boton-secundario">Filtrar</button>
          <Link href="/afiliados/ingresos">Limpiar</Link>
        </form>
        <p className="affiliate-help">
          En este período: {dinero(r.ingresosPeriodoCentavos)} · {r.ventas} ventas. Los reembolsos
          ajustan el ingreso de la venta original.
        </p>
        <Historial filas={r.historial} />
        {r.siguienteCursor && (
          <Link className="boton-secundario" href={`/afiliados/ingresos?${next}`}>
            Siguiente página
          </Link>
        )}
      </section>
    </>
  )
}
