import Link from 'next/link'
import { notFound } from 'next/navigation'
import { catalogApi } from '@/api/catalog'
import { gamificationApi } from '@/api/resto'
import { enrollmentApi } from '@/api/enrollment'
import { BarraProgreso, ErrorConAccion } from '@/componentes/base'
import { perfilSesion } from '@/lib/sesion'

const ArrowIcon = (): JSX.Element => (
  <svg className="inline-icon inline-arrow" aria-hidden="true" viewBox="0 0 24 24">
    <path d="M5 12h13m-5-5 5 5-5 5" />
  </svg>
)

const PathIcon = ({
  tipo,
}: {
  tipo: 'diagnostico' | 'contenido' | 'repaso' | 'evaluacion' | 'certificado'
}): JSX.Element => {
  const paths = {
    diagnostico: (
      <>
        <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
        <path d="m8 12 2 2 5-5M8 7h8M8 17h5" />
      </>
    ),
    contenido: (
      <>
        <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5v-16Z" />
        <path d="M5 5.5v16M9 7h6M9 11h6" />
      </>
    ),
    repaso: (
      <>
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H20v14H6.5A2.5 2.5 0 0 0 4 21.5v-14Z" />
        <path d="M4 7.5v14M8 9h8M8 13h6" />
      </>
    ),
    evaluacion: (
      <>
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
      </>
    ),
    certificado: (
      <>
        <path d="M12 3 19 6v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3Z" />
        <path d="m8.5 12 2.2 2.2 4.8-5" />
      </>
    ),
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {paths[tipo]}
    </svg>
  )
}

const TechPathIcon = ({
  tipo,
}: {
  tipo: 'test' | 'lesson' | 'review' | 'challenge'
}): JSX.Element => {
  const paths = {
    test: (
      <>
        <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
        <path d="M8 8h8M8 12h5M8 16h3" />
      </>
    ),
    lesson: (
      <>
        <path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
      </>
    ),
    review: (
      <>
        <path d="M4 7h16v13H4z" />
        <path d="M8 7V5h8v2M8 12h8M8 16h5" />
      </>
    ),
    challenge: (
      <>
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
      </>
    ),
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {paths[tipo]}
    </svg>
  )
}

type TechPathNode = {
  key: string
  titulo: string
  subtitulo: string
  etiqueta: string
  estado: 'complete' | 'available' | 'locked'
  tipo: 'test' | 'lesson' | 'review' | 'challenge'
  href?: string
  nivel?: number
}

const MascotaRuta = (): JSX.Element => (
  <svg
    className="learning-map-mascot"
    viewBox="0 0 120 120"
    role="img"
    aria-label="Mascota de tu ruta de aprendizaje"
  >
    <path className="learning-map-mascot-ear" d="m25 40-8-27 26 13 7 17Z" />
    <path className="learning-map-mascot-ear" d="m95 40 8-27-26 13-7 17Z" />
    <path
      className="learning-map-mascot-body"
      d="M23 52c0-23 16-38 37-38s37 15 37 38v25c0 21-16 32-37 32S23 98 23 77Z"
    />
    <path
      className="learning-map-mascot-face"
      d="M37 58c0-10 10-18 23-18s23 8 23 18-10 18-23 18-23-8-23-18Z"
    />
    <circle className="learning-map-mascot-eye" cx="49" cy="58" r="4" />
    <circle className="learning-map-mascot-eye" cx="71" cy="58" r="4" />
    <path className="learning-map-mascot-smile" d="M54 68q6 7 12 0" />
    <path className="learning-map-mascot-badge" d="m60 82 4 7 8 1-6 6 2 8-8-4-8 4 2-8-6-6 8-1Z" />
  </svg>
)

// Pantalla 5: mapa del curso. Los tomos en una ruta vertical con su estado
// (bloqueado / disponible / completado). El nodo actual se distingue por color
// y borde, NO por rebote (doc 11 §4, D19).
const MapaCurso = async ({
  params,
}: {
  params: Promise<{ cursoSlug: string }>
}): Promise<JSX.Element> => {
  const { cursoSlug } = await params
  const perfil = await perfilSesion()
  if (!perfil) {
    return (
      <ErrorConAccion
        titulo="Necesitas iniciar sesión"
        detalle="Este curso es parte de tu ruta de aprendizaje: entra para continuar donde lo dejaste."
        accion={{ texto: 'Entrar', href: `/login?destino=/aprender/${cursoSlug}` }}
      />
    )
  }

  const curso = await catalogApi.curso(cursoSlug)
  if (!curso) notFound()

  const progreso = await enrollmentApi.progreso(curso.id)
  if (!progreso) {
    return (
      <ErrorConAccion
        titulo="Todavía no tienes acceso a este curso"
        detalle="Matricúlate para empezar. Si acabas de pagar, dale unos segundos y recarga."
        accion={{ texto: 'Ver el curso', href: `/cursos/${cursoSlug}` }}
      />
    )
  }
  const gamificacion = await gamificationApi.miPerfil()
  const evaluacionInicial = await enrollmentApi.evaluacionInicial(curso.id)
  const evaluacionInicialCompletada = evaluacionInicial.completado

  const completadas = new Set(
    progreso.tomos.flatMap(t => t.lecciones.filter(l => l.completada).map(l => l.leccionId)),
  )
  const totalLecciones = curso.tomos.reduce((s, t) => s + t.lecciones.length, 0)
  const ordenLecciones = curso.tomos.flatMap(tomo => tomo.lecciones.map(leccion => leccion.id))
  const primerPendiente = ordenLecciones.findIndex(leccionId => !completadas.has(leccionId))
  const totalTomos = curso.tomos.length
  const tomosCompletados = progreso.tomos.filter(tomo => tomo.completado).length
  const totalPorcentaje =
    totalLecciones === 0 ? 0 : Math.round((completadas.size / totalLecciones) * 100)
  const cursoCompletado = totalTomos > 0 && tomosCompletados === totalTomos
  const evaluacionInicialHref = `/aprender/${cursoSlug}/evaluacion-inicial`
  const diagnosticoHref = '/diagnostico'
  const primeraPendiente = curso.tomos
    .flatMap(tomo => tomo.lecciones.map(leccion => ({ ...leccion, tomoId: tomo.id })))
    .find(leccion => !completadas.has(leccion.id))
  const siguienteHref = !evaluacionInicialCompletada
    ? evaluacionInicialHref
    : primeraPendiente
      ? '/aprender/' + cursoSlug + '/' + primeraPendiente.id
      : '/aprender/' + cursoSlug
  const asesoríaHref =
    'mailto:hello@edtech.dev?subject=' +
    encodeURIComponent('Asesoría gratuita · ' + curso.titulo) +
    '&body=' +
    encodeURIComponent(
      'Hola, quisiera solicitar mi asesoría gratuita del curso ' + curso.titulo + '.',
    )

  const nodosRuta: TechPathNode[] = [
    {
      key: 'evaluacion-inicial',
      titulo: evaluacionInicialCompletada ? 'Test inicial superado' : 'Test inicial',
      subtitulo: evaluacionInicialCompletada
        ? 'Punto de partida definido'
        : 'Descubre tu nivel antes de comenzar',
      etiqueta: 'PUNTO DE PARTIDA',
      estado: evaluacionInicialCompletada ? 'complete' : 'available',
      tipo: 'test',
      href: evaluacionInicialHref,
    },
    ...curso.tomos.flatMap((tomo): TechPathNode[] =>
      tomo.lecciones.map(leccion => {
        const hecha = completadas.has(leccion.id)
        const indiceGlobal = ordenLecciones.indexOf(leccion.id)
        const disponible =
          evaluacionInicialCompletada &&
          (hecha || primerPendiente < 0 || indiceGlobal <= primerPendiente)
        return {
          key: leccion.id,
          titulo: leccion.titulo,
          subtitulo: `${leccion.duracionMin} min · ${tomo.titulo}`,
          etiqueta: `NIVEL ${String(tomo.orden).padStart(2, '0')}`,
          estado: hecha ? 'complete' : disponible ? 'available' : 'locked',
          tipo: 'lesson',
          href: disponible ? `/aprender/${cursoSlug}/${leccion.id}` : undefined,
          nivel: tomo.orden,
        }
      }),
    ),
  ]

  return (
    <div className="tech-learning-map">
      <nav className="learning-breadcrumbs" aria-label="Migas de pan">
        <Link href="/dashboard">Mi panel</Link>
        <span aria-hidden="true">/</span>
        <span>{curso.titulo}</span>
      </nav>

      <div className="learning-map-gamebar" aria-label="Estadísticas de aprendizaje">
        <div className="learning-map-gamebar-item is-streak">
          <span className="learning-map-gamebar-icon" aria-hidden="true">
            🔥
          </span>
          <span>
            <strong>{gamificacion?.rachaActual ?? 0}</strong>
            <small>días de racha</small>
          </span>
        </div>
        <div className="learning-map-gamebar-item">
          <span className="learning-map-gamebar-icon" aria-hidden="true">
            ✦
          </span>
          <span>
            <strong>{gamificacion?.puntos ?? 0}</strong>
            <small>puntos XP</small>
          </span>
        </div>
        <div className="learning-map-gamebar-item">
          <span className="learning-map-gamebar-icon" aria-hidden="true">
            🏁
          </span>
          <span>
            <strong>{totalPorcentaje}%</strong>
            <small>del camino</small>
          </span>
        </div>
      </div>

      <header className="learning-map-hero">
        <div className="learning-map-hero-copy">
          <p className="learning-map-eyebrow">TU CAMINO · {curso.tecnologia}</p>
          <h1>{curso.titulo}</h1>
          <p>{curso.descripcion}</p>
          <div className="learning-map-hero-message">
            <span aria-hidden="true">✦</span>
            <p>
              <strong>
                {!evaluacionInicialCompletada
                  ? 'Primero descubre tu punto de partida.'
                  : completadas.size === 0
                    ? 'Tu próxima aventura empieza aquí.'
                    : '¡Vas muy bien!'}
              </strong>
              <span>
                {!evaluacionInicialCompletada
                  ? 'Haz el test inicial para desbloquear la primera misión.'
                  : 'Completa cada misión para desbloquear el siguiente nivel.'}
              </span>
            </p>
          </div>
          <div className="learning-map-hero-actions">
            <Link href={siguienteHref} className="boton-primario">
              {!evaluacionInicialCompletada
                ? 'Empezar test inicial'
                : cursoCompletado
                  ? 'Revisar mi camino'
                  : 'Continuar camino'}{' '}
              <ArrowIcon />
            </Link>
            <Link href={diagnosticoHref} className="boton-secundario">
              Hacer diagnóstico
            </Link>
          </div>
        </div>

        <aside className="learning-map-progress-card" aria-label="Resumen de progreso">
          <div className="learning-map-progress-ring" aria-hidden="true">
            <strong>{totalPorcentaje}%</strong>
            <span>avance</span>
          </div>
          <div>
            <p className="learning-map-progress-label">Tu progreso</p>
            <p className="learning-map-progress-value">
              {completadas.size} de {totalLecciones} lecciones
            </p>
            <p className="learning-map-progress-meta">
              {tomosCompletados} de {totalTomos} tomos completados
            </p>
          </div>
        </aside>
      </header>

      <div className="learning-map-progress-bar">
        <BarraProgreso
          valor={completadas.size}
          total={totalLecciones}
          etiqueta="Lecciones completadas"
        />
      </div>

      <section className="tech-path-section" aria-labelledby="course-path-title">
        <div className="tech-path-heading">
          <div>
            <p className="course-map-kicker">RUTA DEL CURSO</p>
            <h2 id="course-path-title">Tu camino de aprendizaje</h2>
            <p>
              Completa una misión para revelar la siguiente. Cada nodo guarda una habilidad
              práctica.
            </p>
          </div>
          <div className="tech-path-legend" aria-label="Estados de la ruta">
            <span>
              <i className="is-complete" />
              Completado
            </span>
            <span>
              <i className="is-available" />
              Disponible
            </span>
            <span>
              <i className="is-locked" />
              Bloqueado
            </span>
          </div>
        </div>

        <div className="tech-path-guide">
          <div className="tech-path-guide-mascot">
            <MascotaRuta />
          </div>
          <div>
            <p className="course-map-kicker">TU SIGUIENTE MISIÓN</p>
            <h3>
              {!evaluacionInicialCompletada
                ? 'Primero calibra tu nivel'
                : completadas.size === 0
                  ? 'Tu primera misión está lista'
                  : 'Sigue construyendo tu perfil tech'}
            </h3>
            <p>
              {!evaluacionInicialCompletada
                ? 'Completa el test inicial para activar el camino.'
                : 'Tus avances desbloquean nuevas habilidades, retos y repasos.'}
            </p>
          </div>
          <span className="tech-path-guide-code">CSS / 01</span>
        </div>

        <ol className="tech-path" aria-label="Misiones del curso">
          {nodosRuta.map((nodo, index) => {
            const esInicioNivel =
              nodo.nivel !== undefined &&
              (index === 1 || nodosRuta[index - 1]?.nivel !== nodo.nivel)
            const lado = index % 2 === 0 ? 'is-left' : 'is-right'
            const nodeClass = `tech-path-step ${lado} is-${nodo.estado} ${nodo.tipo === 'test' ? 'is-start' : ''}`
            const contenido = (
              <span className="tech-path-orb" aria-hidden="true">
                <TechPathIcon tipo={nodo.tipo} />
              </span>
            )
            return (
              <li key={nodo.key}>
                {esInicioNivel && (
                  <div className="tech-path-level-marker">
                    <span>NIVEL {String(nodo.nivel).padStart(2, '0')}</span>
                    <strong>{curso.tomos.find(tomo => tomo.orden === nodo.nivel)?.titulo}</strong>
                    <small>
                      {curso.tomos.find(tomo => tomo.orden === nodo.nivel)?.materiales.length ?? 0}
                      /4 materiales · repaso · evaluación
                    </small>
                  </div>
                )}
                <div
                  className={nodeClass}
                  aria-current={nodo.estado === 'available' ? 'step' : undefined}
                >
                  {nodo.href ? (
                    <Link
                      href={nodo.href}
                      className="tech-path-orb-link"
                      aria-label={`${nodo.titulo}. ${nodo.subtitulo}`}
                    >
                      {contenido}
                    </Link>
                  ) : (
                    <span className="tech-path-orb-link is-disabled" aria-disabled="true">
                      {contenido}
                    </span>
                  )}
                  <div className="tech-path-step-copy">
                    <span className="tech-path-step-label">{nodo.etiqueta}</span>
                    <strong>{nodo.titulo}</strong>
                    <small>{nodo.subtitulo}</small>
                    <span className="tech-path-step-state">
                      {nodo.estado === 'complete'
                        ? 'Completado'
                        : nodo.estado === 'available'
                          ? 'Empezar misión'
                          : 'Completa la misión anterior'}
                    </span>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="course-coach-card" id="asesoria" aria-labelledby="coach-title">
        <div className="course-coach-copy">
          <span className="course-coach-icon" aria-hidden="true">
            <PathIcon tipo="certificado" />
          </span>
          <div>
            <p className="course-map-kicker">ACOMPAÑAMIENTO</p>
            <h2 id="coach-title">Tu primera asesoría está incluida</h2>
            <p>
              Por comprar este curso tienes una asesoría gratuita para resolver dudas, revisar tu
              avance o definir tu siguiente proyecto.
            </p>
          </div>
        </div>
        <a href={asesoríaHref} className="boton-primario">
          Solicitar asesoría <ArrowIcon />
        </a>
      </section>
    </div>
  )
}

export default MapaCurso
