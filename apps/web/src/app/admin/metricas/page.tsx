import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { paymentsApi } from '@/api/resto'
import { ErrorConAccion, Vacio, precioTexto } from '@/componentes/base'
import { esAdmin, mfaPendiente } from '@/lib/sesion'

// Pantalla 14: métricas. Muestra bruto, comisión y neto SEPARADOS: mostrar solo
// el bruto es engañarse (doc 09 §7).
const Metricas = async (): Promise<JSX.Element> => {
  if (!(await esAdmin())) {
    return (
      <ErrorConAccion
        titulo="Necesitas permisos de administrador"
        detalle="Las métricas de ingresos son solo para administradores."
        accion={{ texto: 'Iniciar sesión', href: '/admin/login' }}
      />
    )
  }

  if (await mfaPendiente()) {
    return (
      <ErrorConAccion
        titulo="Configura tu segundo factor para entrar"
        detalle="El panel de administración exige verificación en dos pasos (doc 08 §6). Toma un minuto."
        accion={{ texto: 'Configurarlo ahora', href: '/configurar-mfa' }}
      />
    )
  }

  const [ordenes, cursos] = await Promise.all([
    paymentsApi.ordenesAdmin().catch(() => []),
    catalogApi.cursosAdmin().catch(() => []),
  ])

  const capturadas = ordenes.filter(o => o.estado === 'CAPTURADA')
  const bruto = capturadas.reduce((s, o) => s + o.monto, 0)
  const comision = capturadas.reduce((s, o) => s + (o.comision ?? 0), 0)
  const neto = capturadas.reduce((s, o) => s + (o.neto ?? 0), 0)
  const moneda = capturadas[0]?.moneda ?? 'USD'

  const porCurso = new Map<string, { titulo: string; ventas: number; bruto: number }>()
  for (const orden of capturadas) {
    const titulo = cursos.find(c => c.id === orden.cursoId)?.titulo ?? orden.cursoId
    const previo = porCurso.get(orden.cursoId) ?? { titulo, ventas: 0, bruto: 0 }
    porCurso.set(orden.cursoId, {
      titulo,
      ventas: previo.ventas + 1,
      bruto: previo.bruto + orden.monto,
    })
  }
  const ranking = [...porCurso.values()].sort((a, b) => b.bruto - a.bruto)

  return (
    <div className="tech-admin-metrics">
      <nav className="text-sm text-slate-500">
        <Link href="/admin" className="transition-colors hover:text-marca-600">
          Administración
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-slate-700">Métricas</span>
      </nav>

      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Métricas</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { etiqueta: 'Ventas', valor: String(capturadas.length), tono: 'text-slate-900' },
          { etiqueta: 'Bruto', valor: precioTexto(bruto, moneda), tono: 'text-slate-900' },
          {
            etiqueta: 'Comisión PayPal',
            valor: precioTexto(comision, moneda),
            tono: 'text-alerta-700',
          },
          { etiqueta: 'Neto', valor: precioTexto(neto, moneda), tono: 'text-exito-700' },
        ].map(dato => (
          <div key={dato.etiqueta} className="tarjeta p-5">
            <p className="text-xs font-bold uppercase text-slate-500">{dato.etiqueta}</p>
            <p className={`mt-2 text-2xl font-extrabold ${dato.tono}`}>{dato.valor}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        La comisión y el neto son los que devuelve PayPal al capturar, no una fórmula propia que
        envejece.
      </p>

      <h2 className="mt-10 text-xl font-extrabold text-slate-900">Cursos más vendidos</h2>
      {ranking.length === 0 ? (
        <div className="mt-4">
          <Vacio
            titulo="Todavía no hay ventas registradas"
            detalle="Cuando se complete la primera compra, aparecerá acá con su desglose de bruto, comisión y neto."
          />
        </div>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="pb-3 font-bold">Curso</th>
              <th className="pb-3 font-bold">Ventas</th>
              <th className="pb-3 font-bold">Bruto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ranking.map(fila => (
              <tr key={fila.titulo}>
                <td className="py-3 font-bold text-slate-900">{fila.titulo}</td>
                <td className="py-3 text-slate-600">{fila.ventas}</td>
                <td className="py-3 font-bold text-slate-700">{precioTexto(fila.bruto, moneda)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default Metricas
