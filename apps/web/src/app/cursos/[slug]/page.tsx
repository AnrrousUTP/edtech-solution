import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  Code2,
  Layers3,
  ListChecks,
  Route,
  Sparkles,
  Target,
} from 'lucide-react'
import { catalogApi } from '@/api/catalog'
import { enrollmentApi } from '@/api/enrollment'
import { Etiqueta, NivelBadge, precioTexto } from '@/componentes/base'
import { perfilSesion } from '@/lib/sesion'
import { BotonMatricularGratis } from './boton-matricular'

const courseTone = (tecnologia: string): string => {
  const normalized = tecnologia.toLowerCase()
  if (normalized.includes('javascript') || normalized.includes('react')) return 'violet'
  if (normalized.includes('python') || normalized.includes('data')) return 'lime'
  return 'cyan'
}

// Pantalla 3: ficha comercial del curso con recorrido, temario y CTA contextual.
const DetalleCurso = async ({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<JSX.Element> => {
  const { slug } = await params
  const curso = await catalogApi.curso(slug)
  if (!curso) notFound()

  const perfil = await perfilSesion()
  const matriculas = perfil ? await enrollmentApi.misMatriculas().catch(() => []) : []
  const matricula = matriculas.find(m => m.cursoId === curso.id && m.estado === 'ACTIVA')

  const totalLecciones = curso.tomos.reduce((suma, t) => suma + t.lecciones.length, 0)
  const totalMinutos = curso.tomos.reduce(
    (suma, t) => suma + t.lecciones.reduce((s, l) => s + l.duracionMin, 0),
    0,
  )
  const totalHoras = Math.max(1, Math.ceil(totalMinutos / 60))
  const tone = courseTone(curso.tecnologia)

  return (
    <div className="course-detail-page">
      <p className="sr-only" data-assistant-context>
        Curso: {curso.titulo}. Tecnología: {curso.tecnologia}. Nivel: {curso.nivelMin}
        {curso.nivelMax !== curso.nivelMin ? ` a ${curso.nivelMax}` : ''}. {curso.descripcion} Tiene{' '}
        {curso.tomos.length} tomos, {totalLecciones} lecciones y aproximadamente {totalHoras} horas
        de contenido.
      </p>
      <Link href="/cursos" className="course-detail-backlink">
        <ArrowLeft aria-hidden="true" />
        <span>Volver al catálogo</span>
      </Link>

      <section className={`course-detail-hero course-detail-hero--${tone}`}>
        <div className="course-detail-hero-art" aria-hidden="true">
          <div className="course-detail-art-orbit course-detail-art-orbit--one" />
          <div className="course-detail-art-orbit course-detail-art-orbit--two" />
          <div className="course-detail-art-card">
            <Code2 />
            <span>{curso.tecnologia}</span>
          </div>
          <div className="course-detail-art-node course-detail-art-node--top">&lt;/&gt;</div>
          <div className="course-detail-art-node course-detail-art-node--bottom">{`{ }`}</div>
          <span className="course-detail-art-label">APRENDER · PRACTICAR · CREAR</span>
        </div>

        <div className="course-detail-hero-copy">
          <div className="course-detail-eyebrow">
            <Etiqueta>{curso.tecnologia}</Etiqueta>
            <NivelBadge nivel={curso.nivelMin} />
            {curso.nivelMax !== curso.nivelMin && <Etiqueta>hasta {curso.nivelMax}</Etiqueta>}
          </div>
          <p className="course-detail-kicker">
            <Sparkles aria-hidden="true" />
            Tu siguiente habilidad empieza aquí
          </p>
          <h1>{curso.titulo}</h1>
          <p className="course-detail-lead">{curso.descripcion}</p>
          <div className="course-detail-hero-note">
            <Target aria-hidden="true" />
            <span>Avanza a tu ritmo con un recorrido claro y práctico.</span>
          </div>
        </div>
      </section>

      <div className="course-detail-stat-row" aria-label="Resumen del curso">
        <div className="course-detail-stat">
          <Layers3 aria-hidden="true" />
          <span>
            <strong>{curso.tomos.length}</strong> {curso.tomos.length === 1 ? 'tomo' : 'tomos'}
          </span>
        </div>
        <div className="course-detail-stat">
          <BookOpen aria-hidden="true" />
          <span>
            <strong>{totalLecciones}</strong> lecciones
          </span>
        </div>
        <div className="course-detail-stat">
          <Clock3 aria-hidden="true" />
          <span>
            <strong>{totalHoras} h</strong> aproximadas
          </span>
        </div>
        <div className="course-detail-stat">
          <Route aria-hidden="true" />
          <span>
            Nivel <strong>{curso.nivelMin}</strong>
          </span>
        </div>
      </div>

      <div className="course-detail-content-grid">
        <main>
          <section className="course-detail-section course-detail-overview">
            <div className="course-detail-section-heading">
              <div>
                <span className="course-detail-section-label">Tu recorrido</span>
                <h2>Aprende paso a paso</h2>
              </div>
              <p>{curso.tomos.length} etapas para convertir conceptos en práctica.</p>
            </div>

            <div className="course-detail-roadmap" aria-label="Recorrido del curso">
              {curso.tomos.map((tomo, index) => (
                <a href={`#tomo-${tomo.id}`} className="course-detail-roadmap-item" key={tomo.id}>
                  <span className="course-detail-roadmap-number">{index + 1}</span>
                  <span>
                    <strong>{tomo.titulo}</strong>
                    <small>{tomo.lecciones.length} lecciones</small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </a>
              ))}
            </div>
          </section>

          <section className="course-detail-section" id="temario">
            <div className="course-detail-section-heading">
              <div>
                <span className="course-detail-section-label">Contenido del curso</span>
                <h2>Esto es lo que vas a construir</h2>
              </div>
              <p>Abre cada etapa para conocer sus lecciones.</p>
            </div>

            <div className="course-detail-syllabus">
              {curso.tomos.map((tomo, index) => (
                <details
                  key={tomo.id}
                  id={`tomo-${tomo.id}`}
                  className="course-detail-tomo"
                  open={index === 0}
                >
                  <summary>
                    <span className="course-detail-tomo-number">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="course-detail-tomo-title">
                      <strong>{tomo.titulo}</strong>
                      <small>
                        {tomo.lecciones.length} lecciones · aprueba con {tomo.umbral}%
                      </small>
                    </span>
                    <ArrowRight className="course-detail-tomo-arrow" aria-hidden="true" />
                  </summary>
                  <div className="course-detail-tomo-body">
                    {tomo.descripcion && <p>{tomo.descripcion}</p>}
                    <ul>
                      {tomo.lecciones.map(leccion => (
                        <li key={leccion.id}>
                          <CheckCircle2 aria-hidden="true" />
                          <span>{leccion.titulo}</span>
                          <small>{leccion.duracionMin} min</small>
                        </li>
                      ))}
                    </ul>
                    {tomo.materiales.length > 0 && (
                      <div className="course-detail-material-note">
                        <BookOpen aria-hidden="true" />
                        <span>
                          {tomo.materiales.length}{' '}
                          {tomo.materiales.length === 1
                            ? 'material disponible'
                            : 'materiales disponibles'}{' '}
                          para repasar
                        </span>
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section className="course-detail-section course-detail-benefits">
            <div className="course-detail-section-heading">
              <div>
                <span className="course-detail-section-label">Tu experiencia</span>
                <h2>Todo lo que tienes para avanzar</h2>
              </div>
            </div>
            <div className="course-detail-benefit-grid">
              <article>
                <ListChecks aria-hidden="true" />
                <h3>Progreso visible</h3>
                <p>
                  Completa lecciones y evaluaciones siguiendo un camino que siempre te dice cuál es
                  el siguiente paso.
                </p>
              </article>
              <article>
                <BookOpen aria-hidden="true" />
                <h3>Repaso con intención</h3>
                <p>
                  Usa los materiales y las flashcards validadas para reforzar lo que acabas de
                  aprender.
                </p>
              </article>
              <article>
                <Sparkles aria-hidden="true" />
                <h3>Reconocimiento</h3>
                <p>
                  Al completar el curso desbloqueas tu insignia y el certificado correspondiente.
                </p>
              </article>
            </div>
          </section>
        </main>

        <aside className="course-detail-purchase-column">
          <div className="course-detail-purchase-card">
            <span className="course-detail-purchase-label">Empieza hoy</span>
            <p className="course-detail-price">{precioTexto(curso.precio, curso.moneda)}</p>
            <p className="course-detail-purchase-copy">
              {curso.precio === 0
                ? 'Accede al curso y comienza tu recorrido de aprendizaje.'
                : 'Una sola compra para avanzar por todo el contenido del curso.'}
            </p>

            <div className="course-detail-purchase-action">
              {matricula ? (
                <Link href={`/aprender/${curso.slug}`} className="boton-exito w-full">
                  Continuar el curso
                  <ArrowRight aria-hidden="true" />
                </Link>
              ) : !perfil ? (
                <a
                  href={`/login?destino=${encodeURIComponent(`/cursos/${curso.slug}`)}`}
                  className="boton-primario w-full"
                >
                  Entrar para empezar
                  <ArrowRight aria-hidden="true" />
                </a>
              ) : curso.precio === 0 ? (
                <BotonMatricularGratis cursoId={curso.id} slug={curso.slug} />
              ) : (
                <Link href={`/checkout/${curso.slug}`} className="boton-primario w-full">
                  Comprar el curso
                  <ArrowRight aria-hidden="true" />
                </Link>
              )}
            </div>

            <ul className="course-detail-included-list">
              <li>
                <CheckCircle2 aria-hidden="true" />
                <span>Acceso sin caducidad</span>
              </li>
              <li>
                <CheckCircle2 aria-hidden="true" />
                <span>Insignia y certificado al completarlo</span>
              </li>
              <li>
                <CheckCircle2 aria-hidden="true" />
                <span>Flashcards de repaso revisadas por una persona</span>
              </li>
            </ul>

            <Link href="#temario" className="course-detail-see-content">
              <BookOpen aria-hidden="true" />
              Ver el contenido completo
            </Link>
          </div>

          <div className="course-detail-help-card">
            <div className="course-detail-help-icon" aria-hidden="true">
              <Sparkles />
            </div>
            <div>
              <strong>¿No sabes por dónde empezar?</strong>
              <p>Haz el diagnóstico y encuentra el punto de partida que mejor encaja contigo.</p>
              <Link href="/diagnostico">
                Hacer diagnóstico <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default DetalleCurso
