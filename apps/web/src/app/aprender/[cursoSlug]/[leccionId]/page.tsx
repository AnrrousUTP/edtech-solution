import Link from 'next/link'
import { notFound } from 'next/navigation'
import { catalogApi } from '@/api/catalog'
import { enrollmentApi } from '@/api/enrollment'
import { BarraProgreso, ErrorConAccion } from '@/componentes/base'
import { RenderBloque } from '@/componentes/bloques'
import { BotonCompletar } from './boton-completar'

// Pantalla 6: reproductor de la lección con barra de progreso siempre visible.
const Reproductor = async ({
  params,
}: {
  params: Promise<{ cursoSlug: string; leccionId: string }>
}): Promise<JSX.Element> => {
  const { cursoSlug, leccionId } = await params

  const curso = await catalogApi.curso(cursoSlug)
  if (!curso) notFound()

  const progreso = await enrollmentApi.progreso(curso.id)
  if (!progreso) {
    return (
      <ErrorConAccion
        titulo="No tienes acceso a esta lección"
        detalle="Necesitas estar matriculado en el curso para verla."
        accion={{ texto: 'Ver el curso', href: `/cursos/${cursoSlug}` }}
      />
    )
  }

  const ordenLecciones = curso.tomos.flatMap(tomo => tomo.lecciones.map(leccion => leccion.id))
  const completadas = new Set(
    progreso.tomos.flatMap(tomo =>
      tomo.lecciones.filter(leccion => leccion.completada).map(leccion => leccion.leccionId),
    ),
  )
  const indiceActual = ordenLecciones.indexOf(leccionId)
  const primerPendiente = ordenLecciones.findIndex(id => !completadas.has(id))
  if (
    indiceActual < 0 ||
    (primerPendiente >= 0 && indiceActual > primerPendiente && !completadas.has(leccionId))
  ) {
    return (
      <ErrorConAccion
        titulo="Esta lección está bloqueada"
        detalle="Completa los nodos anteriores del mapa para abrirla."
        accion={{ texto: 'Volver al mapa', href: `/aprender/${cursoSlug}` }}
      />
    )
  }

  const leccion = await catalogApi.leccion(leccionId)
  if (!leccion) notFound()

  const tomo = curso.tomos.find(t => t.id === leccion.tomoId)
  const indice = tomo?.lecciones.findIndex(l => l.id === leccionId) ?? -1
  const siguiente = tomo && indice >= 0 ? tomo.lecciones[indice + 1] : undefined
  const estadoTomo = progreso.tomos.find(t => t.tomoId === leccion.tomoId)
  const yaCompletada =
    estadoTomo?.lecciones.find(l => l.leccionId === leccionId)?.completada ?? false
  const hechasEnTomo = estadoTomo?.lecciones.filter(l => l.completada).length ?? 0
  const todasMenosEsta =
    (estadoTomo?.lecciones.length ?? 0) - (hechasEnTomo + (yaCompletada ? 0 : 1)) === 0

  return (
    <div className="tech-lesson-page grid gap-8 lg:grid-cols-4">
      <div className="lg:col-span-3">
        <nav className="text-sm text-slate-500">
          <Link href={`/aprender/${cursoSlug}`} className="transition-colors hover:text-marca-600">
            {curso.titulo}
          </Link>
          {tomo && (
            <>
              <span aria-hidden="true"> / </span>
              <span>Tomo {tomo.orden}</span>
            </>
          )}
        </nav>

        <h1 className="mt-2 text-3xl font-extrabold text-slate-900">{leccion.titulo}</h1>

        <article className="mt-8 space-y-5">
          {leccion.bloques.map(bloque => (
            <RenderBloque key={bloque.orden} bloque={bloque} />
          ))}
        </article>

        {leccion.ejercicios.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xl font-extrabold text-slate-900">Ejercicios</h2>
            <ol className="mt-4 space-y-4">
              {leccion.ejercicios.map((ejercicio, i) => (
                <li key={ejercicio.id} className="tarjeta p-5">
                  <p className="font-bold text-slate-900">Ejercicio {i + 1}</p>
                  <p className="mt-2 text-slate-700">{ejercicio.enunciado}</p>
                  {ejercicio.pistas.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-bold text-marca-600">
                        Ver pista
                      </summary>
                      <ul className="mt-2 space-y-1 text-sm text-slate-600">
                        {ejercicio.pistas.map((pista, j) => (
                          <li key={j}>{String(pista)}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6">
          <BotonCompletar
            leccionId={leccionId}
            cursoId={curso.id}
            cursoSlug={cursoSlug}
            yaCompletada={yaCompletada}
            siguienteLeccionId={siguiente?.id ?? null}
            tomoId={leccion.tomoId}
            cierraElTomo={todasMenosEsta}
          />
          <Link href={`/aprender/${cursoSlug}`} className="boton-secundario">
            Volver al mapa
          </Link>
        </div>
      </div>

      <aside className="lg:col-span-1">
        <div className="tarjeta sticky top-6 p-5">
          <p className="text-xs font-bold uppercase text-slate-500">Progreso del tomo</p>
          <div className="mt-3">
            <BarraProgreso
              valor={hechasEnTomo}
              total={estadoTomo?.lecciones.length ?? 0}
              etiqueta={tomo?.titulo ?? 'Tomo'}
            />
          </div>
          <ul className="mt-5 space-y-1">
            {tomo?.lecciones.map(otra => {
              const hecha =
                estadoTomo?.lecciones.find(l => l.leccionId === otra.id)?.completada ?? false
              const esActual = otra.id === leccionId
              const indiceOtra = ordenLecciones.indexOf(otra.id)
              const disponible = hecha || primerPendiente < 0 || indiceOtra <= primerPendiente
              return (
                <li key={otra.id}>
                  {disponible ? (
                    <Link
                      href={`/aprender/${cursoSlug}/${otra.id}`}
                      className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${
                        esActual
                          ? 'bg-marca-50 font-bold text-marca-700'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                      aria-current={esActual ? 'page' : undefined}
                    >
                      {hecha ? '✓ ' : ''}
                      {otra.titulo}
                    </Link>
                  ) : (
                    <span
                      className="block rounded-lg px-3 py-1.5 text-sm text-slate-400"
                      aria-disabled="true"
                    >
                      {otra.titulo} <span className="text-xs">· bloqueada</span>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </aside>
    </div>
  )
}

export default Reproductor
