import { notFound } from 'next/navigation'
import { catalogApi } from '@/api/catalog'
import { enrollmentApi } from '@/api/enrollment'
import { ErrorConAccion, Vacio } from '@/componentes/base'
import { Examen } from '@/componentes/examen'
import { perfilSesion } from '@/lib/sesion'

export default async function ConocimientoPrevio({
  params,
}: {
  params: Promise<{ cursoSlug: string; tomoId: string }>
}): Promise<JSX.Element> {
  const { cursoSlug, tomoId } = await params
  if (!(await perfilSesion()))
    return (
      <ErrorConAccion
        titulo="Inicia sesión para comenzar"
        detalle="Este test registra lo que ya conoces antes de estudiar la semana."
        accion={{ texto: 'Entrar', href: `/login?destino=/aprender/${cursoSlug}/conocimiento-previo/${tomoId}` }}
      />
    )

  const curso = await catalogApi.curso(cursoSlug)
  if (!curso) notFound()
  const tomo = curso.tomos.find(item => item.id === tomoId)
  if (!tomo) notFound()

  const [progreso, banco, estado] = await Promise.all([
    enrollmentApi.progreso(curso.id),
    catalogApi.conocimientoPrevioDeTomo(tomoId),
    enrollmentApi.conocimientoPrevio(curso.id, tomoId),
  ])
  if (!progreso)
    return (
      <ErrorConAccion
        titulo="Necesitas estar matriculado"
        detalle="Matricúlate para realizar el test de conocimiento previo."
        accion={{ texto: 'Ver el curso', href: `/cursos/${cursoSlug}` }}
      />
    )
  if (!banco)
    return (
      <Vacio
        titulo="El test aún no está configurado"
        detalle="El docente todavía no ha publicado el test previo de esta semana."
        accion={{ texto: 'Volver al mapa', href: `/aprender/${cursoSlug}` }}
      />
    )
  if (estado.completado)
    return (
      <ErrorConAccion
        titulo="Test previo completado"
        detalle="Tus respuestas ya están guardadas. Continúa con los materiales de la semana."
        accion={{ texto: 'Abrir la semana', href: `/aprender/${cursoSlug}` }}
      />
    )
  const semanasAnterioresCompletas = curso.tomos
    .slice(0, curso.tomos.findIndex(item => item.id === tomoId))
    .every(semana => semana.lecciones.every(leccion =>
      progreso.tomos.find(estadoTomo => estadoTomo.tomoId === semana.id)?.lecciones
        .find(estadoLeccion => estadoLeccion.leccionId === leccion.id)?.completada,
    ))
  if (!semanasAnterioresCompletas)
    return (
      <ErrorConAccion
        titulo="Completa la semana anterior"
        detalle="Este test se abre cuando hayas terminado las lecciones de las semanas anteriores."
        accion={{ texto: 'Volver al mapa', href: `/aprender/${cursoSlug}` }}
      />
    )

  return (
    <div className="tech-level-test">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <p className="text-sm text-slate-600">
          Semana: <strong>{tomo.titulo}</strong>. Este test sirve para identificar qué conoces antes de estudiar; cualquier puntaje desbloquea el contenido.
        </p>
      </div>
      <Examen
        titulo={`Conocimiento previo · ${tomo.titulo}`}
        preguntas={banco.preguntas}
        bancoId={banco.bancoId}
        tipo="CONOCIMIENTO_PREVIO_TOMO"
        cursoId={curso.id}
        tomoId={tomo.id}
        umbral={0}
        volverA={`/aprender/${cursoSlug}`}
      />
    </div>
  )
}
