import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import EdtechLogo from '@/componentes/edtech-logo'

const SearchIcon = (): JSX.Element => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="gs-icon">
    <path d="m20 20-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
  </svg>
)

const ArrowIcon = (): JSX.Element => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="gs-icon">
    <path d="M5 12h13m-5-5 5 5-5 5" />
  </svg>
)

const RouteIcon = ({ type }: { type: 'code' | 'data' | 'cloud' }): JSX.Element => {
  if (type === 'data') {
    return (
      <svg aria-hidden="true" viewBox="0 0 48 48" className="gs-route-icon">
        <rect x="7" y="7" width="34" height="34" rx="9" />
        <path d="M14 32V23m10 9V15m10 17V20M11 35h26" />
        <circle cx="14" cy="23" r="2" />
        <circle cx="24" cy="15" r="2" />
        <circle cx="34" cy="20" r="2" />
      </svg>
    )
  }

  if (type === 'cloud') {
    return (
      <svg aria-hidden="true" viewBox="0 0 48 48" className="gs-route-icon">
        <path d="M15 36h21a8 8 0 0 0 1-15.9A12 12 0 0 0 14 18a9 9 0 0 0 1 18Z" />
        <path d="M24 17v18m0 0 6-6m-6 6-6-6" />
      </svg>
    )
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="gs-route-icon">
      <rect x="7" y="8" width="34" height="32" rx="8" />
      <path d="m20 17-7 7 7 7m8-14 7 7-7 7" />
    </svg>
  )
}

const Landing = async (): Promise<JSX.Element> => {
  const rutas = await catalogApi.carreras().catch(() => [])
  const iconosRuta = ['code', 'data', 'cloud'] as const
  const coloresRuta = ['gs-route-card-blue', 'gs-route-card-green', 'gs-route-card-red'] as const

  return (
    <div className="home-page gs-home">
      <section className="gs-hero" aria-labelledby="hero-title">
        <div className="gs-hero-copy">
          <h1 id="hero-title">
            Aprende habilidades que <span>abren posibilidades.</span>
          </h1>
          <p className="gs-hero-lead">
            Rutas guiadas, práctica real y credenciales que convierten tu curiosidad en progreso
            visible.
          </p>
          <div className="gs-hero-actions">
            <Link href="/cursos" className="gs-button gs-button-primary">
              Explorar cursos <ArrowIcon />
            </Link>
            <Link href="#rutas" className="gs-button gs-button-secondary">
              Ver rutas de aprendizaje
            </Link>
          </div>
          <div className="gs-hero-note">
            <span className="gs-avatar-stack" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>Aprende a tu ritmo, desde cualquier lugar</span>
          </div>
        </div>

        <div className="gs-hero-visual" aria-label="Vista previa de una ruta de aprendizaje">
          <div className="gs-hero-orbit gs-hero-orbit-blue" />
          <div className="gs-hero-orbit gs-hero-orbit-yellow" />
          <div className="gs-learning-card">
            <div className="gs-learning-card-top">
              <span className="gs-small-label">TU PRÓXIMO PASO</span>
              <span className="gs-status-dot">● En progreso</span>
            </div>
            <div className="gs-learning-card-brand">
              <EdtechLogo compact showName={false} />
              <span>Ruta de desarrollo web</span>
            </div>
            <h2>Fundamentos de programación</h2>
            <p>Construye una base sólida para crear, probar y compartir tus primeras ideas.</p>
            <div className="gs-progress-meta">
              <span>4 de 12 módulos</span>
              <b>33%</b>
            </div>
            <div className="gs-progress-bar">
              <i />
            </div>
            <div className="gs-learning-card-bottom">
              <span>Python · 6 h estimadas</span>
              <Link href="/cursos">
                Continuar <ArrowIcon />
              </Link>
            </div>
          </div>
          <div className="gs-floating-badge gs-floating-badge-top">
            <span className="gs-badge-glyph">✓</span>
            <span>
              <b>Tu progreso</b>
              <small>se guarda automáticamente</small>
            </span>
          </div>
          <div className="gs-floating-badge gs-floating-badge-bottom">
            <span className="gs-badge-glyph gs-badge-glyph-yellow">★</span>
            <span>
              <b>Aprende haciendo</b>
              <small>retos, proyectos y evidencia</small>
            </span>
          </div>
        </div>
      </section>

      <section className="gs-discovery" aria-labelledby="discovery-title">
        <div className="gs-section-heading gs-section-heading-centered">
          <p className="gs-eyebrow">DESCUBRE TU PRÓXIMA HABILIDAD</p>
          <h2 id="discovery-title">¿Qué quieres aprender?</h2>
          <p>Explora cursos y rutas creadas para avanzar con claridad, paso a paso.</p>
        </div>
        <Link href="/cursos" className="gs-search-box" aria-label="Buscar cursos y habilidades">
          <SearchIcon />
          <span>Buscar cursos, temas o habilidades</span>
          <kbd>⌘ K</kbd>
        </Link>
        <div className="gs-topic-chips" aria-label="Temas destacados">
          <Link href="/cursos?tema=programacion">Programación</Link>
          <Link href="/cursos?tema=datos">Datos e IA</Link>
          <Link href="/cursos?tema=cloud">Cloud</Link>
          <Link href="/cursos?tema=web">Desarrollo web</Link>
          <Link href="/cursos">
            Ver todo <ArrowIcon />
          </Link>
        </div>
      </section>

      <section id="rutas" className="gs-routes" aria-labelledby="routes-title">
        <div className="gs-section-heading gs-section-heading-row">
          <div>
            <p className="gs-eyebrow">APRENDIZAJE CON DIRECCIÓN</p>
            <h2 id="routes-title">Rutas para llegar más lejos</h2>
          </div>
          <Link href="/cursos#rutas" className="gs-text-link">
            Ver todas las rutas <ArrowIcon />
          </Link>
        </div>
        <div className="gs-route-grid">
          {rutas.length ? (
            rutas.slice(0, 3).map((ruta, indice) => (
              <Link
                key={ruta.id}
                href={`/rutas/${ruta.slug}`}
                className={`gs-route-card ${coloresRuta[indice % coloresRuta.length]}`}
              >
                <div className="gs-route-icon-wrap">
                  <RouteIcon type={iconosRuta[indice % iconosRuta.length]} />
                </div>
                <span className="gs-card-kicker">RUTA DE APRENDIZAJE</span>
                <h3>{ruta.titulo}</h3>
                <p>{ruta.descripcion}</p>
                <span className="gs-route-card-footer">
                  {ruta.cursos.length} {ruta.cursos.length === 1 ? 'curso' : 'cursos'} <ArrowIcon />
                </span>
              </Link>
            ))
          ) : (
            <div className="gs-route-empty">
              Las rutas se están preparando. Explora el catálogo para comenzar con un curso.
              <Link href="/cursos">
                Ver cursos disponibles <ArrowIcon />
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="gs-feature-split" aria-labelledby="practice-title">
        <div className="gs-feature-art" aria-hidden="true">
          <div className="gs-art-window">
            <div className="gs-art-window-head">
              <i />
              <i />
              <i />
              <span>edtech / practice</span>
            </div>
            <div className="gs-art-lines">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="gs-art-check">✓</div>
          </div>
          <span className="gs-art-shape gs-art-shape-one" />
          <span className="gs-art-shape gs-art-shape-two" />
          <span className="gs-art-shape gs-art-shape-three" />
        </div>
        <div className="gs-feature-copy">
          <p className="gs-eyebrow">APRENDER HACIENDO</p>
          <h2 id="practice-title">La práctica convierte el conocimiento en confianza.</h2>
          <p>
            Avanza con lecciones breves, ejercicios y proyectos que te permiten demostrar lo que
            sabes. Cada logro queda en tu perfil para que puedas volver a él.
          </p>
          <div className="gs-feature-points">
            <span>
              <b>01</b>
              <strong>Lecciones claras</strong>
              <small>Conceptos explicados sin ruido.</small>
            </span>
            <span>
              <b>02</b>
              <strong>Retos reales</strong>
              <small>Practica con problemas concretos.</small>
            </span>
            <span>
              <b>03</b>
              <strong>Evidencia visible</strong>
              <small>Construye un camino que puedes compartir.</small>
            </span>
          </div>
          <Link href="/cursos" className="gs-text-link">
            Conoce cómo funciona <ArrowIcon />
          </Link>
        </div>
      </section>

      <section className="gs-catalog-preview" aria-labelledby="catalog-title">
        <div className="gs-section-heading gs-section-heading-row">
          <div>
            <p className="gs-eyebrow">EMPIEZA HOY</p>
            <h2 id="catalog-title">Cursos para tu siguiente paso</h2>
          </div>
          <Link href="/cursos" className="gs-text-link">
            Explorar catálogo <ArrowIcon />
          </Link>
        </div>
        <div className="gs-course-grid">
          <article className="gs-course-card">
            <div className="gs-course-art gs-course-art-yellow">
              <span>01</span>
              <RouteIcon type="code" />
            </div>
            <div className="gs-course-card-copy">
              <span className="gs-card-kicker">PYTHON · PRINCIPIANTE</span>
              <h3>Piensa como programador</h3>
              <p>Variables, lógica y funciones para comenzar.</p>
              <span className="gs-course-meta">8 lecciones · 3 h</span>
            </div>
          </article>
          <article className="gs-course-card">
            <div className="gs-course-art gs-course-art-blue">
              <span>02</span>
              <RouteIcon type="data" />
            </div>
            <div className="gs-course-card-copy">
              <span className="gs-card-kicker">DATOS · INTERMEDIO</span>
              <h3>De datos a decisiones</h3>
              <p>Ordena, analiza y comunica tus hallazgos.</p>
              <span className="gs-course-meta">10 lecciones · 5 h</span>
            </div>
          </article>
          <article className="gs-course-card">
            <div className="gs-course-art gs-course-art-green">
              <span>03</span>
              <RouteIcon type="cloud" />
            </div>
            <div className="gs-course-card-copy">
              <span className="gs-card-kicker">WEB · PRINCIPIANTE</span>
              <h3>Crea tu primera web</h3>
              <p>HTML, CSS y una interfaz que responde.</p>
              <span className="gs-course-meta">12 lecciones · 6 h</span>
            </div>
          </article>
        </div>
      </section>

      <section className="gs-progress-banner" aria-labelledby="progress-title">
        <div>
          <p className="gs-eyebrow">TU RECORRIDO, A TU RITMO</p>
          <h2 id="progress-title">Cada sesión te acerca a algo que puedes construir.</h2>
          <p>
            Regístrate gratis para guardar tu progreso, desbloquear rutas y obtener reconocimientos
            por lo que completas.
          </p>
          <Link href="/register" className="gs-button gs-button-light">
            Crear mi cuenta <ArrowIcon />
          </Link>
        </div>
        <div className="gs-progress-visual">
          <span className="gs-progress-ring">
            <b>33</b>
            <small>%</small>
          </span>
          <span className="gs-progress-node node-one" />
          <span className="gs-progress-node node-two" />
          <span className="gs-progress-node node-three" />
          <span className="gs-progress-line" />
        </div>
      </section>

      <section id="faq" className="gs-faq" aria-labelledby="faq-title">
        <div className="gs-section-heading">
          <p className="gs-eyebrow">PREGUNTAS FRECUENTES</p>
          <h2 id="faq-title">Antes de comenzar</h2>
          <p>Todo lo que necesitas saber para dar tu primer paso.</p>
        </div>
        <div className="gs-faq-list">
          <details open>
            <summary>
              <span>¿Necesito experiencia previa?</span>
              <b>+</b>
            </summary>
            <p>
              No. Las rutas empiezan desde los fundamentos y aumentan su dificultad de manera
              progresiva.
            </p>
          </details>
          <details>
            <summary>
              <span>¿Puedo aprender a mi propio ritmo?</span>
              <b>+</b>
            </summary>
            <p>Sí. Tus cursos y avances quedan guardados para que puedas volver cuando quieras.</p>
          </details>
          <details>
            <summary>
              <span>¿Qué obtengo al completar una ruta?</span>
              <b>+</b>
            </summary>
            <p>
              Obtienes progreso verificable, reconocimientos y una base práctica para seguir
              construyendo.
            </p>
          </details>
        </div>
      </section>

      <section id="contactanos" className="gs-final-cta" aria-labelledby="cta-title">
        <EdtechLogo compact showName={false} />
        <p className="gs-eyebrow">LISTO PARA EMPEZAR</p>
        <h2 id="cta-title">Tu próxima habilidad empieza aquí.</h2>
        <p>Explora el catálogo y encuentra una ruta que se adapte a lo que quieres construir.</p>
        <Link href="/cursos" className="gs-button gs-button-primary">
          Explorar catálogo <ArrowIcon />
        </Link>
      </section>
    </div>
  )
}

export default Landing
