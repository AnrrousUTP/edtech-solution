import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { Etiqueta, NivelBadge, Vacio, precioTexto, tramoDe } from '@/componentes/base'

const CATEGORIAS = [
  {
    nombre: 'IA y datos',
    detalle: 'Modelos, automatización y análisis',
    codigo: '01',
    icono: 'data',
  },
  { nombre: 'Desarrollo web', detalle: 'Frontend, backend y APIs', codigo: '02', icono: 'web' },
  { nombre: 'Cloud', detalle: 'Infraestructura y despliegues', codigo: '03', icono: 'cloud' },
  {
    nombre: 'Productividad',
    detalle: 'Herramientas para trabajar mejor',
    codigo: '04',
    icono: 'productivity',
  },
  {
    nombre: 'Seguridad',
    detalle: 'Sistemas confiables desde el diseño',
    codigo: '05',
    icono: 'security',
  },
  {
    nombre: 'Fundamentos',
    detalle: 'La base para seguir avanzando',
    codigo: '06',
    icono: 'fundamentals',
  },
]

const SearchIcon = (): JSX.Element => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="catalog-icon">
    <path d="m20 20-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
  </svg>
)

const ArrowIcon = (): JSX.Element => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="catalog-icon">
    <path d="M5 12h13m-5-5 5 5-5 5" />
  </svg>
)

const CategoryIcon = ({ icono }: { icono: string }): JSX.Element => {
  if (icono === 'data') {
    return (
      <svg aria-hidden="true" viewBox="0 0 48 48" className="catalog-category-icon">
        <path d="M9 35V20m10 15V12m10 23V24m10 11V8" />
        <path d="M6 39h36" />
        <circle cx="9" cy="20" r="3" />
        <circle cx="19" cy="12" r="3" />
        <circle cx="29" cy="24" r="3" />
        <circle cx="39" cy="8" r="3" />
      </svg>
    )
  }
  if (icono === 'web') {
    return (
      <svg aria-hidden="true" viewBox="0 0 48 48" className="catalog-category-icon">
        <rect x="7" y="9" width="34" height="29" rx="6" />
        <path d="M7 17h34M14 13h.01M19 13h.01M24 13h.01m-8 12 5 5 10-10" />
      </svg>
    )
  }
  if (icono === 'cloud') {
    return (
      <svg aria-hidden="true" viewBox="0 0 48 48" className="catalog-category-icon">
        <path d="M15 36h21a8 8 0 0 0 1-15.9A12 12 0 0 0 14 18a9 9 0 0 0 1 18Z" />
        <path d="M24 18v17m0 0 6-6m-6 6-6-6" />
      </svg>
    )
  }
  if (icono === 'productivity') {
    return (
      <svg aria-hidden="true" viewBox="0 0 48 48" className="catalog-category-icon">
        <rect x="8" y="9" width="32" height="30" rx="6" />
        <path d="m15 24 6 6 12-13" />
      </svg>
    )
  }
  if (icono === 'security') {
    return (
      <svg aria-hidden="true" viewBox="0 0 48 48" className="catalog-category-icon">
        <path d="M24 7 38 13v10c0 9-6 15-14 19-8-4-14-10-14-19V13l14-6Z" />
        <path d="m17 24 5 5 10-11" />
      </svg>
    )
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="catalog-category-icon">
      <path d="m18 15-8 9 8 9m12-18 8 9-8 9M27 9l-6 30" />
    </svg>
  )
}

const FALLBACK_RUTAS = [
  {
    id: 'ruta-desarrollo-web',
    titulo: 'Ruta de desarrollo web',
    descripcion: 'De tu primera etiqueta HTML a una aplicación completa.',
    cantidad: 8,
  },
  {
    id: 'ruta-datos-ia',
    titulo: 'Ruta de datos e IA',
    descripcion: 'Aprende a convertir datos en decisiones y productos útiles.',
    cantidad: 6,
  },
  {
    id: 'ruta-cloud',
    titulo: 'Ruta de fundamentos cloud',
    descripcion: 'Entiende la nube y despliega con criterio técnico.',
    cantidad: 5,
  },
]

type Props = {
  searchParams: Promise<{ q?: string; tecnologia?: string; tramo?: string; precio?: string }>
}

const Catalogo = async ({ searchParams }: Props): Promise<JSX.Element> => {
  const filtros = await searchParams
  const [cursos, carreras] = await Promise.all([
    catalogApi.cursos().catch(() => []),
    catalogApi.carreras().catch(() => []),
  ])

  const tecnologias = [...new Set(cursos.map(c => c.tecnologia))].sort()
  const busqueda = filtros.q?.trim().toLocaleLowerCase('es') ?? ''
  const visibles = cursos.filter(curso => {
    if (busqueda) {
      const indice = [curso.titulo, curso.descripcion, curso.tecnologia, curso.slug]
        .join(' ')
        .toLocaleLowerCase('es')
      if (!indice.includes(busqueda)) return false
    }
    if (filtros.tecnologia && curso.tecnologia !== filtros.tecnologia) return false
    if (filtros.tramo && tramoDe(curso.nivelMin) !== filtros.tramo) return false
    if (filtros.precio === 'gratis' && curso.precio !== 0) return false
    if (filtros.precio === 'pago' && curso.precio === 0) return false
    return true
  })
  const rutas =
    carreras.length > 0
      ? carreras.map(carrera => ({
          id: carrera.id,
          titulo: carrera.titulo,
          descripcion: carrera.descripcion,
          cantidad: carrera.cursos.length,
        }))
      : FALLBACK_RUTAS

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
      className={`catalog-filter ${activo ? 'is-active' : ''}`}
      aria-pressed={activo}
    >
      {texto}
    </Link>
  )

  return (
    <div className="catalog-public">
      <div className="catalog-layout">
        <aside className="tech-sidebar" aria-label="Explorar catálogo">
          <div className="tech-sidebar-label">WORKSPACE</div>
          <h2>Explorar EdTech</h2>
          <nav className="tech-sidebar-nav">
            <a href="#categorias" className="is-active">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z" />
                </svg>
              </span>{' '}
              Áreas
            </a>
            <a href="#cursos">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z" />
                </svg>
              </span>{' '}
              Cursos
            </a>
            <a href="#rutas">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M6 6h8a4 4 0 0 1 4 4v8M18 14l3 4-3 4" />
                </svg>
              </span>{' '}
              Rutas
            </a>
            <a href="#credenciales">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="m12 4 7 4v8l-7 4-7-4V8l7-4Zm0 4v12M5 8l7 4 7-4" />
                </svg>
              </span>{' '}
              Credenciales
            </a>
          </nav>
          <div className="tech-sidebar-note">
            <span className="tech-sidebar-note-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
              </svg>
            </span>
            <strong>Aprende con intención</strong>
            <p>Elige una ruta. Construye algo. Repite.</p>
          </div>
        </aside>

        <div className="catalog-content">
          <section id="categorias" className="tech-section catalog-discovery-section">
            <div className="tech-section-heading catalog-section-heading">
              <div>
                <p className="tech-section-kicker">01 / ÁREAS DE APRENDIZAJE</p>
                <h1>¿Qué quieres explorar?</h1>
                <p className="catalog-section-intro">
                  Encuentra una habilidad, una ruta y el siguiente proyecto que quieres construir.
                </p>
              </div>
              <span className="tech-section-meta">
                <b>{CATEGORIAS.length}</b> áreas activas
              </span>
            </div>
            <div className="catalog-category-grid">
              {CATEGORIAS.map(categoria => (
                <Link
                  key={categoria.nombre}
                  href={enlace({ tecnologia: categoria.nombre })}
                  className="catalog-category-card"
                >
                  <span
                    className={`catalog-category-icon-wrap catalog-category-icon-${categoria.icono}`}
                  >
                    <CategoryIcon icono={categoria.icono} />
                  </span>
                  <span className="catalog-category-code">{categoria.codigo}</span>
                  <span className="catalog-category-main">
                    <strong>{categoria.nombre}</strong>
                    <small>{categoria.detalle}</small>
                  </span>
                  <span className="catalog-category-action" aria-hidden="true">
                    <ArrowIcon />
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section id="cursos" className="tech-section catalog-course-section">
            <div className="tech-section-heading catalog-course-heading">
              <div>
                <p className="tech-section-kicker">02 / CATÁLOGO</p>
                <h2>Aprende haciendo</h2>
                <p className="catalog-count">
                  {visibles.length}{' '}
                  {visibles.length === 1 ? 'curso disponible' : 'cursos disponibles'}
                  {busqueda ? ` / búsqueda: ${filtros.q}` : ''}
                </p>
              </div>
            </div>

            <form className="catalog-search" action="/cursos" method="get">
              <label className="sr-only" htmlFor="catalog-search-input">
                Buscar en EdTech
              </label>
              <SearchIcon />
              <input
                id="catalog-search-input"
                name="q"
                type="search"
                defaultValue={filtros.q ?? ''}
                placeholder="Buscar cursos, temas o habilidades"
              />
              {filtros.tecnologia && (
                <input type="hidden" name="tecnologia" value={filtros.tecnologia} />
              )}
              {filtros.tramo && <input type="hidden" name="tramo" value={filtros.tramo} />}
              {filtros.precio && <input type="hidden" name="precio" value={filtros.precio} />}
              <button type="submit">
                <span>Buscar</span>
                <SearchIcon />
              </button>
            </form>

            <div className="catalog-filters" role="group" aria-label="Filtros del catálogo">
              <div>
                <span>Tecnología</span>
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
              <div>
                <span>Nivel</span>
                <Filtro texto="Todos" activo={!filtros.tramo} href={enlace({ tramo: undefined })} />
                {['Fundamentos', 'Intermedio', 'Avanzado', 'Profesional'].map(t => (
                  <Filtro
                    key={t}
                    texto={t}
                    activo={filtros.tramo === t}
                    href={enlace({ tramo: t })}
                  />
                ))}
              </div>
              <div>
                <span>Precio</span>
                <Filtro
                  texto="Todos"
                  activo={!filtros.precio}
                  href={enlace({ precio: undefined })}
                />
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

            {visibles.length === 0 ? (
              <Vacio
                titulo="Ningún curso coincide con esos filtros"
                detalle="Prueba quitando alguno o mira el catálogo completo."
                accion={{ texto: 'Ver todo el catálogo', href: '/cursos' }}
              />
            ) : (
              <div className="catalog-course-grid">
                {visibles.map((curso, indice) => (
                  <Link
                    key={curso.id}
                    href={`/cursos/${curso.slug}`}
                    className="catalog-course-card"
                  >
                    <div className={`tech-course-visual ${['cyan', 'violet', 'lime'][indice % 3]}`}>
                      <span className="tech-course-index">0{indice + 1}</span>
                      <span className="tech-course-glyph" aria-hidden="true">
                        {indice % 2 === 0 ? '</>' : 'API'}
                      </span>
                    </div>
                    <div className="tech-course-body">
                      <div className="flex flex-wrap items-center gap-2">
                        <Etiqueta>{curso.tecnologia}</Etiqueta>
                        <NivelBadge nivel={curso.nivelMin} />
                      </div>
                      <h3>{curso.titulo}</h3>
                      <p>{curso.descripcion}</p>
                      <div className="tech-course-footer">
                        <span>{precioTexto(curso.precio, curso.moneda)}</span>
                        <span className="inline-action">
                          Abrir{' '}
                          <span className="catalog-circle-arrow">
                            <ArrowIcon />
                          </span>
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section id="rutas" className="tech-section">
            <div className="tech-section-heading">
              <div>
                <p className="tech-section-kicker">03 / LONG GAME</p>
                <h2>Construye una trayectoria</h2>
              </div>
              <span className="tech-section-meta">Rutas por objetivo</span>
            </div>
            <div className="tech-route-grid">
              {rutas.map((ruta, indice) => (
                <Link key={ruta.id} href="/cursos" className="tech-route-card">
                  <div className="tech-route-topline">
                    <span>0{indice + 1}</span>
                    <span>{ruta.cantidad} cursos</span>
                  </div>
                  <h3>{ruta.titulo}</h3>
                  <p>{ruta.descripcion}</p>
                  <span className="tech-route-cta">
                    <span className="inline-action">
                      Ver la ruta{' '}
                      <span className="catalog-circle-arrow">
                        <ArrowIcon />
                      </span>
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section id="credenciales" className="tech-build-banner">
            <div>
              <p className="tech-section-kicker">04 / OUTPUT</p>
              <h2>Tu próxima versión se construye aquí.</h2>
              <p>
                Completa proyectos, consigue insignias y demuestra que puedes resolver problemas
                reales.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/diagnostico" className="tech-build-button">
                Diagnóstico previo{' '}
                <svg className="inline-icon inline-arrow" aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M5 12h13m-5-5 5 5-5 5" />
                </svg>
              </Link>
              <Link href="/nivelacion" className="tech-build-button">
                Encontrar mi nivel{' '}
                <svg className="inline-icon inline-arrow" aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M5 12h13m-5-5 5 5-5 5" />
                </svg>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default Catalogo
