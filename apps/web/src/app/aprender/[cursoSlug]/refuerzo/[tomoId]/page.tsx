import { notFound } from 'next/navigation'
import { catalogApi } from '@/api/catalog'
import { enrollmentApi } from '@/api/enrollment'
import { ErrorConAccion, Vacio } from '@/componentes/base'
import { Examen } from '@/componentes/examen'

export default async function Refuerzo({
  params,
}: {
  params: Promise<{ cursoSlug: string; tomoId: string }>
}): Promise<JSX.Element> {
  const { cursoSlug, tomoId } = await params
  const curso = await catalogApi.curso(cursoSlug)
  if (!curso) notFound()
  const tomo = curso.tomos.find(item => item.id === tomoId)
  if (!tomo) notFound()
  const progreso = await enrollmentApi.progreso(curso.id)
  if (!progreso) {
    return (
      <ErrorConAccion
        titulo="No tienes acceso a este refuerzo"
        detalle="Necesitas estar matriculado en el curso para practicar."
        accion={{ texto: 'Ver el curso', href: `/cursos/${cursoSlug}` }}
      />
    )
  }
  const banco = await catalogApi.refuerzoDeTomo(tomoId)
  if (!banco || banco.preguntas.length === 0) {
    return (
      <Vacio
        titulo="Este tomo todavía no tiene refuerzo"
        detalle="El equipo docente aún no publicó preguntas de práctica para este nodo."
        accion={{ texto: 'Volver al mapa', href: `/aprender/${cursoSlug}` }}
      />
    )
  }
  return (
    <div className="tech-evaluation-page">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <p className="text-sm text-slate-600">
          Practica los conceptos del tomo sin afectar tu progreso ni tu certificación.
        </p>
      </div>
      <Examen
        titulo={`Refuerzo — ${tomo.titulo}`}
        preguntas={banco.preguntas}
        bancoId={banco.bancoId}
        tipo="REFUERZO"
        cursoId={curso.id}
        tomoId={tomoId}
        umbral={banco.umbral}
        volverA={`/aprender/${cursoSlug}`}
      />
    </div>
  )
}
