import { notFound } from 'next/navigation'
import { catalogApi } from '@/api/catalog'
import { enrollmentApi } from '@/api/enrollment'
import { ErrorConAccion, Vacio } from '@/componentes/base'
import { Examen } from '@/componentes/examen'

// Pantalla 7: evaluación del tomo con su umbral real.
const EvaluacionTomo = async ({
  params,
}: {
  params: Promise<{ cursoSlug: string; tomoId: string }>
}): Promise<JSX.Element> => {
  const { cursoSlug, tomoId } = await params

  const curso = await catalogApi.curso(cursoSlug)
  if (!curso) notFound()

  const tomo = curso.tomos.find(t => t.id === tomoId)
  if (!tomo) notFound()

  const progreso = await enrollmentApi.progreso(curso.id)
  if (!progreso) {
    return (
      <ErrorConAccion
        titulo="No tienes acceso a esta evaluación"
        detalle="Necesitas estar matriculado en el curso."
        accion={{ texto: 'Ver el curso', href: `/cursos/${cursoSlug}` }}
      />
    )
  }

  const evaluacion = await catalogApi.evaluacionDeTomo(tomoId)
  if (!evaluacion || evaluacion.preguntas.length === 0) {
    return (
      <Vacio
        titulo="Este tomo aún no tiene evaluación"
        detalle="Puedes seguir con el resto del contenido; volveremos a avisarte cuando esté lista."
        accion={{ texto: 'Volver al mapa', href: `/aprender/${cursoSlug}` }}
      />
    )
  }

  const estadoTomo = progreso.tomos.find(t => t.tomoId === tomoId)
  const pendientes = estadoTomo?.lecciones.filter(l => !l.completada).length ?? 0

  return (
    <div>
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <p className="text-sm text-slate-600">
          Necesitas <strong>{evaluacion.umbral}%</strong> para aprobar el tomo. Puedes reintentar
          las veces que haga falta.
        </p>
        {pendientes > 0 && (
          <p className="mt-3 rounded-lg bg-acento-100 p-3 text-sm text-acento-600">
            Te quedan {pendientes} {pendientes === 1 ? 'lección' : 'lecciones'} por completar. El
            tomo se cierra cuando termines todas <em>y</em> apruebes esta evaluación.
          </p>
        )}
      </div>
      <Examen
        titulo={`Evaluación — ${tomo.titulo}`}
        preguntas={evaluacion.preguntas}
        bancoId={evaluacion.bancoId}
        tipo="TOMO"
        cursoId={curso.id}
        tomoId={tomoId}
        umbral={evaluacion.umbral}
        volverA={`/aprender/${cursoSlug}`}
      />
    </div>
  )
}

export default EvaluacionTomo
