import Link from 'next/link'
import { notFound } from 'next/navigation'
import { catalogApi } from '@/api/catalog'
import { enrollmentApi } from '@/api/enrollment'
import { BarraProgreso, ErrorConAccion, Etiqueta } from '@/componentes/base'
import { perfilSesion } from '@/lib/sesion'

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

  const completadas = new Set(
    progreso.tomos.flatMap(t => t.lecciones.filter(l => l.completada).map(l => l.leccionId)),
  )
  const totalLecciones = curso.tomos.reduce((s, t) => s + t.lecciones.length, 0)
  const primerTomoIncompleto = progreso.tomos.find(t => !t.completado)
  const ordenLecciones = curso.tomos.flatMap(tomo => tomo.lecciones.map(leccion => leccion.id))
  const primerPendiente = ordenLecciones.findIndex(leccionId => !completadas.has(leccionId))

  return (
    <div className="tech-learning-map">
      <nav className="text-sm text-slate-500">
        <Link href="/dashboard" className="transition-colors hover:text-marca-600">
          Mi panel
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-slate-700">{curso.titulo}</span>
      </nav>

      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">{curso.titulo}</h1>

      <div className="mt-5 max-w-md">
        <BarraProgreso
          valor={completadas.size}
          total={totalLecciones}
          etiqueta="Lecciones completadas"
        />
      </div>

      <div className="course-map-intro">
        <p className="course-map-kicker">PATH / LEARNING MAP</p>
        <p>
          Completa cada nodo para abrir el siguiente checkpoint. Las lecciones son botones de
          práctica; la evaluación aparece cuando el tomo está listo.
        </p>
      </div>

      {/* Ruta de aprendizaje con nodos y botones de lección. El movimiento se
          reserva para el scroll global; el mapa comunica estados por color,
          borde y contenido. */}
      <ol className="course-map" aria-label="Ruta del curso">
        {curso.tomos.map((tomo, tomoIndex) => {
          const estadoTomo = progreso.tomos.find(t => t.tomoId === tomo.id)
          const completado = estadoTomo?.completado ?? false
          const esActual = primerTomoIncompleto?.tomoId === tomo.id
          const leccionesHechas = tomo.lecciones.filter(l => completadas.has(l.id)).length
          const todasHechas = leccionesHechas === tomo.lecciones.length

          return (
            <li
              key={tomo.id}
              className={`course-map-node course-map-node-${(tomoIndex % 3) + 1} ${completado ? 'is-complete' : ''} ${esActual ? 'is-current' : ''}`}
              aria-current={esActual ? 'step' : undefined}
            >
              <span className="course-map-connector" aria-hidden="true" />
              <div className="course-map-node-head">
                <span
                  className={`course-map-orb ${
                    completado ? 'is-complete' : esActual ? 'is-current' : 'is-locked'
                  }`}
                  aria-hidden="true"
                >
                  {completado ? '✓' : tomo.orden}
                </span>

                <div className="course-map-node-copy">
                  <p>
                    TOMO {String(tomo.orden).padStart(2, '0')} / {tomo.lecciones.length} LECCIONES
                  </p>
                  <h2>{tomo.titulo}</h2>
                </div>
                {completado ? (
                  <Etiqueta tono="exito">Completado</Etiqueta>
                ) : esActual ? (
                  <Etiqueta tono="marca">En curso</Etiqueta>
                ) : (
                  <Etiqueta>Pendiente</Etiqueta>
                )}
              </div>

              <div className="course-map-node-body">
                <ul className="course-map-lessons">
                  {tomo.lecciones.map(leccion => {
                    const hecha = completadas.has(leccion.id)
                    const indiceGlobal = ordenLecciones.indexOf(leccion.id)
                    const desbloqueada =
                      hecha || primerPendiente < 0 || indiceGlobal <= primerPendiente
                    return (
                      <li key={leccion.id}>
                        {desbloqueada ? (
                          <Link
                            href={`/aprender/${cursoSlug}/${leccion.id}`}
                            className={`course-map-lesson ${hecha ? 'is-complete' : ''}`}
                          >
                            <span className="course-map-lesson-index" aria-hidden="true">
                              {hecha ? '✓' : String(leccion.orden).padStart(2, '0')}
                            </span>
                            <span className="course-map-lesson-title">{leccion.titulo}</span>
                            <span className="course-map-lesson-time">
                              {leccion.duracionMin} min
                            </span>
                            <span className="sr-only">
                              {hecha ? 'Lección completada' : 'Lección disponible'}
                            </span>
                          </Link>
                        ) : (
                          <span className="course-map-lesson is-locked" aria-disabled="true">
                            <span className="course-map-lesson-index" aria-hidden="true">
                              {String(leccion.orden).padStart(2, '0')}
                            </span>
                            <span className="course-map-lesson-title">{leccion.titulo}</span>
                            <span className="course-map-lesson-time">
                              {leccion.duracionMin} min
                            </span>
                            <span className="sr-only">Lección bloqueada; completa la anterior</span>
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>

                <div className="course-map-actions">
                  {todasHechas && (
                    <Link
                      href={`/aprender/${cursoSlug}/refuerzo/${tomo.id}`}
                      className="course-map-evaluation is-secondary"
                    >
                      Practicar refuerzo <b>↗</b>
                    </Link>
                  )}
                  {todasHechas && !completado && (
                    <Link
                      href={`/aprender/${cursoSlug}/evaluacion/${tomo.id}`}
                      className="course-map-evaluation"
                    >
                      Evaluar tomo <b>↗</b>
                    </Link>
                  )}
                  {completado && (
                    <Link
                      href={`/repasar/${tomo.id}`}
                      className="course-map-evaluation is-secondary"
                    >
                      Repasar flashcards <b>↗</b>
                    </Link>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default MapaCurso
