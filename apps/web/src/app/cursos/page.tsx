import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { Etiqueta, NivelBadge, Vacio, precioTexto, tramoDe } from '@/componentes/base'

const CATEGORIAS = [
  { nombre: 'IA y datos', detalle: 'Modelos, automatización y análisis', codigo: '01' },
  { nombre: 'Desarrollo web', detalle: 'Frontend, backend y APIs', codigo: '02' },
  { nombre: 'Cloud', detalle: 'Infraestructura y despliegues', codigo: '03' },
  { nombre: 'Productividad', detalle: 'Herramientas para trabajar mejor', codigo: '04' },
  { nombre: 'Seguridad', detalle: 'Sistemas confiables desde el diseño', codigo: '05' },
  { nombre: 'Fundamentos', detalle: 'La base para seguir avanzando', codigo: '06' },
]

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
              <span>⌘</span> Áreas
            </a>
            <a href="#cursos">
              <span>▦</span> Cursos
            </a>
            <a href="#rutas">
              <span>↳</span> Rutas
            </a>
            <a href="#credenciales">
              <span>◇</span> Credenciales
            </a>
          </nav>
          <div className="tech-sidebar-note">
            <span className="tech-sidebar-note-icon">✦</span>
            <strong>Aprende con intención</strong>
            <p>Elige una ruta. Construye algo. Repite.</p>
          </div>
        </aside>

        <div className="catalog-content">
          <section id="categorias" className="tech-section">
            <div className="tech-section-heading">
              <div>
                <p className="tech-section-kicker">01 / ORIENTACIÓN</p>
                <h1>¿Qué quieres explorar?</h1>
              </div>
              <span className="tech-section-meta">{CATEGORIAS.length} áreas activas</span>
            </div>
            <div className="tech-category-grid">
              {CATEGORIAS.map(categoria => (
                <Link
                  key={categoria.nombre}
                  href={enlace({ tecnologia: categoria.nombre })}
                  className="tech-category-card"
                >
                  <span className="tech-category-code">{categoria.codigo}</span>
                  <span className="tech-category-main">
                    <strong>{categoria.nombre}</strong>
                    <small>{categoria.detalle}</small>
                  </span>
                  <span className="tech-arrow" aria-hidden="true">
                    ↗
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section id="cursos" className="tech-section catalog-course-section">
            <div className="tech-section-heading">
              <div>
                <p className="tech-section-kicker">02 / CATÁLOGO</p>
                <h2>Aprende haciendo</h2>
                <p className="catalog-count">
                  {visibles.length}{' '}
                  {visibles.length === 1 ? 'curso disponible' : 'cursos disponibles'}
                  {busqueda ? ` / búsqueda: ${filtros.q}` : ''}
                </p>
              </div>
              <form className="catalog-search" action="/cursos" method="get">
                <label className="sr-only" htmlFor="catalog-search-input">
                  Buscar en EdTech
                </label>
                <input
                  id="catalog-search-input"
                  name="q"
                  type="search"
                  defaultValue={filtros.q ?? ''}
                  placeholder="buscar cursos..."
                />
                {filtros.tecnologia && (
                  <input type="hidden" name="tecnologia" value={filtros.tecnologia} />
                )}
                {filtros.tramo && <input type="hidden" name="tramo" value={filtros.tramo} />}
                {filtros.precio && <input type="hidden" name="precio" value={filtros.precio} />}
                <button type="submit">
                  Buscar <span aria-hidden="true">↗</span>
                </button>
              </form>
            </div>

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
                        <span>Abrir →</span>
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
                    Ver la ruta <b aria-hidden="true">↗</b>
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
                Diagnóstico previo <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/nivelacion" className="tech-build-button">
                Encontrar mi nivel <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default Catalogo
