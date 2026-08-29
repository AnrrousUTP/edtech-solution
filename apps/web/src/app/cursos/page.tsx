import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { Etiqueta, NivelBadge, Vacio, precioTexto, tramoDe } from '@/componentes/base'

// Pantalla 2: catálogo con filtro por tecnología, tramo y precio.
// El filtro va por query params: sin JS de cliente y con URL compartible.
type Props = {
  searchParams: Promise<{ tecnologia?: string; tramo?: string; precio?: string }>
}

const Catalogo = async ({ searchParams }: Props): Promise<JSX.Element> => {
  const filtros = await searchParams
  const cursos = await catalogApi.cursos().catch(() => [])

  const tecnologias = [...new Set(cursos.map(c => c.tecnologia))].sort()
  const visibles = cursos.filter(curso => {
    if (filtros.tecnologia && curso.tecnologia !== filtros.tecnologia) return false
    if (filtros.tramo && tramoDe(curso.nivelMin) !== filtros.tramo) return false
    if (filtros.precio === 'gratis' && curso.precio !== 0) return false
    if (filtros.precio === 'pago' && curso.precio === 0) return false
    return true
  })

  const enlace = (cambio: Record<string, string | undefined>): string => {
    const params = new URLSearchParams()
    const combinado = { ...filtros, ...cambio }
    for (const [k, v] of Object.entries(combinado)) if (v) params.set(k, v)
    const query = params.toString()
    return query ? `/cursos?${query}` : '/cursos'
  }

  const Filtro = ({
    texto,
    activo,
    href,
  }: {
    texto: string
    activo: boolean
    href: string
  }): JSX.Element => (
    <Link
      href={href}
      className={`etiqueta border transition-colors ${
        activo
          ? 'border-marca-600 bg-marca-600 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:border-marca-400 hover:bg-marca-50'
      }`}
      aria-pressed={activo}
    >
      {texto}
    </Link>
  )

  return (
    <div>
      <h1 className="text-3xl font-extrabold text-slate-900">Catálogo</h1>
      <p className="mt-1 text-slate-600">
        {visibles.length} {visibles.length === 1 ? 'curso' : 'cursos'} disponibles
      </p>

      <div className="mt-6 space-y-3" role="group" aria-label="Filtros">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase text-slate-500">Tecnología</span>
          <Filtro
            texto="Todas"
            activo={!filtros.tecnologia}
            href={enlace({ tecnologia: undefined })}
          />
          {tecnologias.map(t => (
            <Filtro
              key={t}
              texto={t}
              activo={filtros.tecnologia === t}
              href={enlace({ tecnologia: t })}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase text-slate-500">Tramo</span>
          <Filtro texto="Todos" activo={!filtros.tramo} href={enlace({ tramo: undefined })} />
          {['Fundamentos', 'Intermedio', 'Avanzado', 'Profesional'].map(t => (
            <Filtro key={t} texto={t} activo={filtros.tramo === t} href={enlace({ tramo: t })} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase text-slate-500">Precio</span>
          <Filtro texto="Todos" activo={!filtros.precio} href={enlace({ precio: undefined })} />
          <Filtro
            texto="Gratis"
            activo={filtros.precio === 'gratis'}
            href={enlace({ precio: 'gratis' })}
          />
          <Filtro
            texto="De pago"
            activo={filtros.precio === 'pago'}
            href={enlace({ precio: 'pago' })}
          />
        </div>
      </div>

      <div className="mt-8">
        {visibles.length === 0 ? (
          <Vacio
            titulo="Ningún curso coincide con esos filtros"
            detalle="Prueba quitando alguno o mira el catálogo completo."
            accion={{ texto: 'Ver todo el catálogo', href: '/cursos' }}
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibles.map(curso => (
              <Link
                key={curso.id}
                href={`/cursos/${curso.slug}`}
                className="tarjeta-interactiva block p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Etiqueta>{curso.tecnologia}</Etiqueta>
                  <NivelBadge nivel={curso.nivelMin} />
                </div>
                <h2 className="mt-3 text-lg font-bold text-slate-900">{curso.titulo}</h2>
                <p className="mt-2 line-clamp-3 text-sm text-slate-600">{curso.descripcion}</p>
                <p className="mt-4 font-extrabold text-marca-600">
                  {precioTexto(curso.precio, curso.moneda)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Catalogo
