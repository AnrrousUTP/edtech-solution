import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, BookOpen, Clock3, Layers3, Route, Sparkles } from 'lucide-react'
import { catalogApi, type CursoDetalle } from '@/api/catalog'
import { Etiqueta, NivelBadge, precioTexto } from '@/componentes/base'

const DetalleRuta = async ({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<JSX.Element> => {
  const { slug } = await params
  const carreras = await catalogApi.carreras()
  const carrera = carreras.find(ruta => ruta.slug === slug)
  if (!carrera) notFound()

  const cursos = (
    await Promise.all(
      [...carrera.cursos]
        .sort((a, b) => a.orden - b.orden)
        .map(curso => catalogApi.curso(curso.cursoId).catch(() => null)),
    )
  ).filter((curso): curso is CursoDetalle => curso !== null)

  const totalLecciones = cursos.reduce(
    (total, curso) =>
      total + curso.tomos.reduce((subtotal, tomo) => subtotal + tomo.lecciones.length, 0),
    0,
  )
  const totalMinutos = cursos.reduce(
    (total, curso) =>
      total +
      curso.tomos.reduce(
        (subtotal, tomo) =>
          subtotal +
          tomo.lecciones.reduce((duracion, leccion) => duracion + leccion.duracionMin, 0),
        0,
      ),
    0,
  )
  const niveles = cursos.flatMap(curso => [curso.nivelMin, curso.nivelMax]).filter(Boolean)
  const nivelInicial = niveles[0] ?? 'A'
  const nivelFinal = niveles[niveles.length - 1] ?? nivelInicial

  return (
    <div className="route-detail-page">
      <Link href="/cursos#rutas" className="admin-backlink route-detail-backlink">
        <ArrowLeft aria-hidden="true" className="inline-icon" />
        Volver a rutas
      </Link>

      <section className="route-detail-hero">
        <div className="route-detail-hero-art" aria-hidden="true">
          <Route />
          <span />
          <span />
          <span />
        </div>
        <div className="route-detail-hero-copy">
          <div className="route-detail-kicker">
            <Sparkles aria-hidden="true" /> Ruta de aprendizaje
          </div>
          <h1>{carrera.titulo}</h1>
          <p>{carrera.descripcion}</p>
          <div className="route-detail-stats" aria-label="Resumen de la ruta">
            <span>
              <BookOpen aria-hidden="true" />
              <b>{cursos.length}</b> {cursos.length === 1 ? 'curso' : 'cursos'}
            </span>
            <span>
              <Layers3 aria-hidden="true" />
              <b>{totalLecciones}</b> lecciones
            </span>
            <span>
              <Clock3 aria-hidden="true" />
              <b>{Math.max(1, Math.round(totalMinutos / 60))}</b> h aproximadas
            </span>
          </div>
        </div>
      </section>

      <section className="route-detail-overview" aria-label="Información de la ruta">
        <div>
          <span>Nivel de entrada</span>
          <strong>{nivelInicial}</strong>
        </div>
        <div>
          <span>Nivel que puedes alcanzar</span>
          <strong>{nivelFinal}</strong>
        </div>
        <div>
          <span>Al completar la ruta</span>
          <strong>Progreso verificable</strong>
        </div>
      </section>

      <section className="route-detail-section" aria-labelledby="route-course-list-title">
        <div className="route-detail-section-heading">
          <div>
            <span className="route-detail-section-label">Tu recorrido</span>
            <h2 id="route-course-list-title">Avanza curso a curso</h2>
          </div>
          <p>El orden lo define el equipo docente para que cada paso prepare el siguiente.</p>
        </div>

        {cursos.length ? (
          <ol className="route-course-list">
            {cursos.map((curso, indice) => {
              const lecciones = curso.tomos.reduce(
                (total, tomo) => total + tomo.lecciones.length,
                0,
              )
              const minutos = curso.tomos.reduce(
                (total, tomo) =>
                  total +
                  tomo.lecciones.reduce((duracion, leccion) => duracion + leccion.duracionMin, 0),
                0,
              )
              return (
                <li key={curso.id} className="route-course-item">
                  <span className="route-course-number">{String(indice + 1).padStart(2, '0')}</span>
                  <div className="route-course-content">
                    <div className="flex flex-wrap items-center gap-2">
                      <Etiqueta>{curso.tecnologia}</Etiqueta>
                      <NivelBadge nivel={curso.nivelMin} />
                    </div>
                    <h3>{curso.titulo}</h3>
                    <p>{curso.descripcion}</p>
                    <div className="route-course-meta">
                      <span>{curso.tomos.length} semanas</span>
                      <span>{lecciones} lecciones</span>
                      <span>{Math.max(1, Math.round(minutos / 60))} h</span>
                    </div>
                  </div>
                  <div className="route-course-action">
                    <span>{precioTexto(curso.precio, curso.moneda)}</span>
                    <Link href={`/cursos/${curso.slug}`} aria-label={`Ver ${curso.titulo}`}>
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <div className="route-detail-empty">
            Esta ruta todavía está preparando sus cursos. Vuelve pronto para comenzar.
          </div>
        )}
      </section>

      <section className="route-detail-cta">
        <div>
          <h2>¿No sabes dónde empezar?</h2>
          <p>Haz el diagnóstico y recibe una orientación para elegir tu primer curso.</p>
        </div>
        <Link href="/diagnostico" className="tech-build-button">
          Encontrar mi nivel <ArrowRight aria-hidden="true" className="inline-icon inline-arrow" />
        </Link>
      </section>
    </div>
  )
}

export default DetalleRuta
