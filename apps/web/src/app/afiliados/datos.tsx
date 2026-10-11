import type { Ingreso } from '@/api/afiliados'
export const dinero = (centavos: number): string =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'USD' }).format(centavos / 100)
export const fecha = (at: string): string =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Lima' }).format(
    new Date(at),
  )
export function Historial({ filas }: { filas: Ingreso[] }): JSX.Element {
  if (!filas.length)
    return (
      <div className="affiliate-empty">
        <h3>Aquí aparecerá tu primera venta</h3>
        <p>Comparte tu QR. Después de una compra confirmada verás el curso y tu comisión.</p>
      </div>
    )
  return (
    <div className="affiliate-table-wrap">
      <table className="affiliate-table">
        <caption className="sr-only">Ingresos registrados por venta referida</caption>
        <thead>
          <tr>
            <th>Curso y fecha</th>
            <th>Compra</th>
            <th>Comisión</th>
            <th>Ingreso</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.id}>
              <td>
                <strong>{f.cursoTitulo}</strong>
                <small>{fecha(f.creadoAt)}</small>
              </td>
              <td>{dinero(f.baseCentavos)}</td>
              <td>5%</td>
              <td>
                <strong>{dinero(f.ingresoCentavos)}</strong>
                {f.ingresoCentavos !== f.originalCentavos && (
                  <small>Original: {dinero(f.originalCentavos)}</small>
                )}
              </td>
              <td>
                <span
                  className={`etiqueta ${f.estado === 'REGISTRADA' ? 'tech-badge-green' : f.estado === 'AJUSTADA' ? 'tech-badge-yellow' : 'tech-badge-red'}`}
                >
                  {f.estado === 'REGISTRADA'
                    ? 'Registrada'
                    : f.estado === 'AJUSTADA'
                      ? 'Ajustada'
                      : 'Anulada'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
