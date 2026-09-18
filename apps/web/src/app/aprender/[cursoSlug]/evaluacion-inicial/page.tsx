import { notFound } from 'next/navigation'
import { catalogApi } from '@/api/catalog'
import { enrollmentApi } from '@/api/enrollment'
import { ErrorConAccion, Vacio } from '@/componentes/base'
import { Examen } from '@/componentes/examen'
import { perfilSesion } from '@/lib/sesion'

export default async function EvaluacionInicial({
  params,
}: {
  params: Promise<{ cursoSlug: string }>
}): Promise<JSX.Element> {
  const { cursoSlug } = await params
  if (!(await perfilSesion()))
    return (
      <ErrorConAccion
        titulo="Inicia sesión para comenzar"
        detalle="La evaluación inicial forma parte de tu ruta del curso y guarda tu punto de partida."
        accion={{
          texto: 'Entrar',
          href: `/login?destino=/aprender/${cursoSlug}/evaluacion-inicial`,
        }}
      />
    )

  const curso = await catalogApi.curso(cursoSlug)
  if (!curso) notFound()

  const progreso = await enrollmentApi.progreso(curso.id)
  if (!progreso) {
    return (
      <ErrorConAccion
        titulo="Necesitas estar matriculado"
        detalle="Compra o habilita el curso para poder realizar su evaluación inicial."
        accion={{ texto: 'Ver el curso', href: `/cursos/${cursoSlug}` }}
      />
    )
  }

  const banco = await catalogApi.evaluacionInicial(curso.id)
  if (!banco) {
    return (
      <Vacio
        titulo="El test inicial todavía no está configurado"
        detalle="El docente debe publicar las preguntas y sus respuestas correctas desde la plataforma docente."
        accion={{ texto: 'Volver al mapa', href: `/aprender/${cursoSlug}` }}
      />
    )
  }

  return (
    <div className="tech-level-test">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <p className="text-sm text-slate-600">
          Esta evaluación pertenece al curso {curso.titulo}. Sirve para conocer tu punto de partida
          antes de abrir la primera misión.
        </p>
      </div>
      <Examen
        titulo="Test inicial del curso"
        preguntas={banco.preguntas}
        bancoId={banco.bancoId}
        tipo="EVALUACION_INICIAL"
        cursoId={curso.id}
        umbral={banco.umbral}
        volverA={`/aprender/${cursoSlug}`}
      />
    </div>
  )
}
