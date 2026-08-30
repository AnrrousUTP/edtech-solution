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
        accion={{ texto: 'Entrar', href: `/api/auth/login?destino=/aprender/${cursoSlug}` }}
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

  return (
    <div>
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

      {/* Mapa de niveles (doc 11 §4): ruta VERTICAL con el estado de cada tomo
          visible. El nodo actual se distingue por color y borde, nunca por
          movimiento (D19). La línea que une los nodos es decorativa. */}
      <ol className="relative mt-10" aria-label="Ruta del curso">
        {curso.tomos.map(tomo => {
          const estadoTomo = progreso.tomos.find(t => t.tomoId === tomo.id)
          const completado = estadoTomo?.completado ?? false
          const esActual = primerTomoIncompleto?.tomoId === tomo.id
          const leccionesHechas = tomo.lecciones.filter(l => completadas.has(l.id)).length
          const todasHechas = leccionesHechas === tomo.lecciones.length

          return (
            <li
              key={tomo.id}
              className="relative pb-6 pl-14 last:pb-0"
              aria-current={esActual ? 'step' : undefined}
            >
              {/* La línea de la ruta: no la dibuja el último nodo */}
              <span
                className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-0.5 bg-slate-200 last:hidden"
                aria-hidden="true"
              />
              <span
                className={`absolute left-0 top-0 grid h-10 w-10 place-items-center rounded-xl border-2 text-sm font-extrabold ${
                  completado
                    ? 'border-exito-500 bg-exito-500 text-white'
                    : esActual
                      ? 'border-marca-600 bg-white text-marca-600'
                      : 'border-slate-200 bg-slate-100 text-slate-400'
                }`}
                aria-hidden="true"
              >
                {completado ? '✓' : tomo.orden}
              </span>

              <div
                className={`tarjeta p-6 ${
                  completado
                    ? 'border-exito-500/40 bg-exito-100/30'
                    : esActual
                      ? 'border-2 border-marca-600'
                      : ''
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-slate-900">
                    Tomo {tomo.orden}: {tomo.titulo}
                  </h2>
                  {completado ? (
                    <Etiqueta tono="exito">Completado</Etiqueta>
                  ) : esActual ? (
                    <Etiqueta tono="marca">En curso</Etiqueta>
                  ) : (
                    <Etiqueta>Pendiente</Etiqueta>
                  )}
                </div>

                <ul className="mt-4 space-y-1.5">
                  {tomo.lecciones.map(leccion => {
                    const hecha = completadas.has(leccion.id)
                    return (
                      <li key={leccion.id}>
                        <Link
                          href={`/aprender/${cursoSlug}/${leccion.id}`}
                          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-slate-100"
                        >
                          <span className="flex items-center gap-2.5">
                            <span
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                                hecha ? 'bg-exito-500 text-white' : 'bg-slate-200 text-slate-600'
                              }`}
                              aria-hidden="true"
                            >
                              {hecha ? '✓' : leccion.orden}
                            </span>
                            <span className={hecha ? 'text-slate-500' : 'text-slate-800'}>
                              {leccion.titulo}
                            </span>
                          </span>
                          <span className="text-xs text-slate-400">{leccion.duracionMin} min</span>
                          <span className="sr-only">
                            {hecha ? 'Lección completada' : 'Lección pendiente'}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>

                <div className="mt-4 flex flex-wrap gap-3">
                  {todasHechas && !completado && (
                    <Link
                      href={`/aprender/${cursoSlug}/evaluacion/${tomo.id}`}
                      className="boton-primario text-xs"
                    >
                      Hacer la evaluación del tomo
                    </Link>
                  )}
                  {completado && (
                    <Link href={`/repasar/${tomo.id}`} className="boton-secundario text-xs">
                      Repasar con flashcards
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
