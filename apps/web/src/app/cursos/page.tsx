import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  CheckSquare,
  Cloud,
  Code2,
  LayoutGrid,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { catalogApi } from '@/api/catalog'
import { Etiqueta, NivelBadge, Vacio, precioTexto, tramoDe } from '@/componentes/base'

const CATEGORIAS = [
  {
    nombre: 'IA y datos',
    detalle: 'Modelos, automatización y análisis',
    codigo: '01',
    icono: 'data',
    tecnologias: ['PYTHON', 'SQL', 'JAVASCRIPT', 'TYPESCRIPT'],
  },
  {
    nombre: 'Desarrollo web',
    detalle: 'Frontend, backend y APIs',
    codigo: '02',
    icono: 'web',
    tecnologias: ['HTML', 'CSS', 'EXPRESS'],
  },
  {
    nombre: 'Cloud',
    detalle: 'Infraestructura y despliegues',
    codigo: '03',
    icono: 'cloud',
    tecnologias: ['AWS', 'AZURE', 'GCP'],
  },
  {
    nombre: 'Productividad',
    detalle: 'Herramientas para trabajar mejor',
    codigo: '04',
    icono: 'productivity',
    tecnologias: ['NOTION', 'EXCEL', 'GIT'],
  },
  {
    nombre: 'Seguridad',
    detalle: 'Sistemas confiables desde el diseño',
    codigo: '05',
    icono: 'security',
    tecnologias: ['SECURITY', 'CYBERSECURITY'],
  },
  {
    nombre: 'Fundamentos',
    detalle: 'La base para seguir avanzando',
    codigo: '06',
    icono: 'fundamentals',
    tecnologias: ['FUNDAMENTOS', 'BASH', 'GIT'],
  },
]

const SearchIcon = (): JSX.Element => <Search aria-hidden="true" className="catalog-icon" />

const ArrowIcon = (): JSX.Element => <ArrowRight aria-hidden="true" className="catalog-icon" />

const CursoPortada = ({
  tecnologia,
  indice,
}: {
  tecnologia: string
  indice: number
}): JSX.Element => {
  const codigo = tecnologia.toLocaleLowerCase('es')
  const portada = codigo.includes('css')
    ? { tono: 'violet', etiqueta: 'ESTILOS / UI', corto: 'CSS', titulo: 'VISUAL SYSTEM' }
    : codigo.includes('html')
      ? { tono: 'cyan', etiqueta: 'WEB / CORE', corto: 'HTML', titulo: 'PAGE STRUCTURE' }
      : codigo.includes('express')
        ? { tono: 'lime', etiqueta: 'BACKEND / API', corto: 'API', titulo: 'SERVER FLOW' }
        : { tono: 'cyan', etiqueta: 'TECH / CORE', corto: 'LAB', titulo: 'BUILD SKILLS' }

  return (
    <div className={`tech-course-cover ${portada.tono}`}>
      <div className="tech-course-cover__topline">
        <span>CURSO / 0{indice + 1}</span>
        <span>{portada.etiqueta}</span>
      </div>
      <svg className="tech-course-cover__art" viewBox="0 0 400 180" aria-hidden="true">
        <path
          className="tech-course-cover__grid"
          d="M0 30h400M0 90h400M0 150h400M80 0v180M200 0v180M320 0v180"
        />
        {portada.corto === 'HTML' && (
          <>
            <rect x="62" y="33" width="276" height="112" rx="14" />
            <path d="M62 63h276M88 49h.01M105 49h.01M122 49h.01" />
            <path d="m113 99 24 19 24-19M180 92l-15 28M205 99l24 19 24-19" />
            <circle cx="290" cy="101" r="17" />
            <path d="m282 101 6 6 11-13" />
          </>
        )}
        {portada.corto === 'CSS' && (
          <>
            <rect x="68" y="38" width="264" height="104" rx="14" />
            <path d="M68 68h264M95 53h.01M112 53h.01M129 53h.01" />
            <path d="M104 103h68M104 119h42M205 91h70v34h-70z" />
            <path d="m224 101 9 9 18-20" />
            <path d="M300 84v50" />
          </>
        )}
        {portada.corto === 'API' && (
          <>
            <rect x="65" y="37" width="270" height="106" rx="14" />
            <path d="M65 67h270M93 52h.01M110 52h.01M127 52h.01" />
            <circle cx="116" cy="104" r="18" />
            <circle cx="284" cy="104" r="18" />
            <path d="M134 104h132M202 86v36M194 96l8-10 8 10" />
          </>
        )}
        {portada.corto === 'LAB' && (
          <>
            <path d="M82 45h236v92H82z" />
            <path d="M82 72h236M111 57h.01M128 57h.01M145 57h.01" />
            <path d="m125 105 18 18 34-38M224 111h58" />
          </>
        )}
      </svg>
      <div className="tech-course-cover__bottomline">
        <strong>{portada.corto}</strong>
        <span>{portada.titulo}</span>
      </div>
    </div>
  )
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  data: LayoutGrid,
  web: Code2,
  cloud: Cloud,
  productivity: CheckSquare,
  security: ShieldCheck,
  fundamentals: BookOpen,
}

const CategoryIcon = ({ icono }: { icono: string }): JSX.Element => {
  const Icon = CATEGORY_ICONS[icono] ?? BookOpen
  return <Icon aria-hidden="true" className="catalog-category-icon" />
}

const FALLBACK_RUTAS = [
  {
    id: 'ruta-desarrollo-web',
    slug: 'ruta-desarrollo-web',
    titulo: 'Ruta de desarrollo web',
    descripcion: 'De tu primera etiqueta HTML a una aplicación completa.',
    cantidad: 8,
  },
  {
    id: 'ruta-datos-ia',
    slug: 'ruta-datos-ia',
    titulo: 'Ruta de datos e IA',
    descripcion: 'Aprende a convertir datos en decisiones y productos útiles.',
    cantidad: 6,
  },
  {
    id: 'ruta-cloud',
    slug: 'ruta-cloud',
    titulo: 'Ruta de fundamentos cloud',
    descripcion: 'Entiende la nube y despliega con criterio técnico.',
    cantidad: 5,
  },
]

type Props = {
  searchParams: Promise<{
    q?: string
    tecnologia?: string
    tramo?: string
    precio?: string
    area?: string
  }>
}

const Catalogo = async ({ searchParams }: Props): Promise<JSX.Element> => {
  const filtros = await searchParams
  const [cursos, carreras] = await Promise.all([
    catalogApi.cursos().catch(() => []),
    catalogApi.carreras().catch(() => []),
  ])

  const tecnologias = [...new Set(cursos.map(c => c.tecnologia))].sort()
  const categoriasActivas = CATEGORIAS.filter(categoria =>
    categoria.tecnologias.some(tecnologia =>
      cursos.some(
        curso => curso.tecnologia.toLocaleLowerCase('es') === tecnologia.toLocaleLowerCase('es'),
      ),
    ),
  )
  const areaSeleccionada = CATEGORIAS.find(categoria => categoria.nombre === filtros.area)
  const busqueda = filtros.q?.trim().toLocaleLowerCase('es') ?? ''
  const visibles = cursos.filter(curso => {
    if (busqueda) {
      const indice = [curso.titulo, curso.descripcion, curso.tecnologia, curso.slug]
        .join(' ')
        .toLocaleLowerCase('es')
      if (!indice.includes(busqueda)) return false
    }
    if (
      areaSeleccionada &&
      !areaSeleccionada.tecnologias.some(
        tecnologia =>
          curso.tecnologia.toLocaleLowerCase('es') === tecnologia.toLocaleLowerCase('es'),
      )
    ) {
      return false
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
          slug: carrera.slug,
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

  return (
    <div className="catalog-public">
      <div className="catalog-layout">
        <aside className="tech-sidebar" aria-label="Explorar catálogo">
          <h2>Explorar catálogo</h2>
          <nav className="tech-sidebar-nav">
            <a href="#categorias" className="is-active">
              <span aria-hidden="true">
                <LayoutGrid />
              </span>{' '}
              Áreas
            </a>
            <a href="#cursos">
              <span aria-hidden="true">
                <BookOpen />
              </span>{' '}
              Cursos
            </a>
            <a href="#rutas">
              <span aria-hidden="true">
                <Route />
              </span>{' '}
              Rutas
            </a>
          </nav>
          <div className="tech-sidebar-note">
            <span className="tech-sidebar-note-icon" aria-hidden="true">
              <Sparkles />
            </span>
            <strong>Aprende con intención</strong>
            <p>Elige una ruta. Construye algo. Repite.</p>
          </div>
        </aside>

        <div className="catalog-content">
          <section id="categorias" className="tech-section catalog-discovery-section">
            <div className="tech-section-heading catalog-section-heading">
              <div>
                <h1>¿Qué quieres explorar?</h1>
                <p className="catalog-section-intro">
                  Encuentra una habilidad, una ruta y el siguiente proyecto que quieres construir.
                </p>
              </div>
              <span className="tech-section-meta">
                <b>{categoriasActivas.length}</b>{' '}
                {categoriasActivas.length === 1 ? 'área activa' : 'áreas activas'}
              </span>
            </div>
            <div className="catalog-category-grid">
              {categoriasActivas.map(categoria => (
                <Link
                  key={categoria.nombre}
                  href={enlace({ area: categoria.nombre, tecnologia: undefined })}
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

            <form className="catalog-filters" action="/cursos" method="get">
              {filtros.q && <input type="hidden" name="q" value={filtros.q} />}
              {filtros.area && <input type="hidden" name="area" value={filtros.area} />}
              <label>
                <span>Tecnología</span>
                <select name="tecnologia" defaultValue={filtros.tecnologia ?? ''}>
                  <option value="">Todas</option>
                  {tecnologias.map(tecnologia => (
                    <option key={tecnologia} value={tecnologia}>
                      {tecnologia}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Nivel</span>
                <select name="tramo" defaultValue={filtros.tramo ?? ''}>
                  <option value="">Todos</option>
                  {['Fundamentos', 'Intermedio', 'Avanzado', 'Profesional'].map(nivel => (
                    <option key={nivel} value={nivel}>
                      {nivel}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Precio</span>
                <select name="precio" defaultValue={filtros.precio ?? ''}>
                  <option value="">Todos</option>
                  <option value="gratis">Gratis</option>
                  <option value="pago">De pago</option>
                </select>
              </label>
              <button type="submit" className="catalog-filter-submit">
                Aplicar
              </button>
            </form>

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
                    <CursoPortada tecnologia={curso.tecnologia} indice={indice} />
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
                <h2>Construye una trayectoria</h2>
              </div>
              <span className="tech-section-meta">Rutas por objetivo</span>
            </div>
            <div className="tech-route-grid">
              {rutas.map((ruta, indice) => (
                <Link key={ruta.id} href={`/rutas/${ruta.slug}`} className="tech-route-card">
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

          <section id="nivel" className="tech-build-banner">
            <div>
              <h2>Encuentra el punto de partida correcto.</h2>
              <p>
                Haz un diagnóstico breve para descubrir qué curso se adapta mejor a tus
                conocimientos actuales.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/diagnostico" className="tech-build-button">
                Diagnóstico previo{' '}
                <ArrowRight aria-hidden="true" className="inline-icon inline-arrow" />
              </Link>
              <Link href="/nivelacion" className="tech-build-button">
                Encontrar mi nivel{' '}
                <ArrowRight aria-hidden="true" className="inline-icon inline-arrow" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default Catalogo
