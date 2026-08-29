import Link from 'next/link'
import { notFound } from 'next/navigation'
import { catalogApi } from '@/api/catalog'
import { enrollmentApi } from '@/api/enrollment'
import { Etiqueta, NivelBadge, precioTexto } from '@/componentes/base'
import { perfilSesion } from '@/lib/sesion'
import { BotonMatricularGratis } from './boton-matricular'

// Pantalla 3: detalle del curso con temario, duración, precio y CTA que cambia
// según si el estudiante ya está matriculado.
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

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <Etiqueta>{curso.tecnologia}</Etiqueta>
          <NivelBadge nivel={curso.nivelMin} />
          {curso.nivelMax !== curso.nivelMin && <Etiqueta>hasta {curso.nivelMax}</Etiqueta>}
        </div>

        <h1 className="mt-4 text-3xl font-extrabold text-slate-900">{curso.titulo}</h1>
        <p className="mt-3 text-lg text-slate-600">{curso.descripcion}</p>

        <div className="mt-6 flex flex-wrap gap-6 text-sm text-slate-600">
          <span>
            <strong className="text-slate-900">{curso.tomos.length}</strong> tomos
          </span>
          <span>
            <strong className="text-slate-900">{totalLecciones}</strong> lecciones
          </span>
          <span>
            <strong className="text-slate-900">{Math.round(totalMinutos / 60)}</strong> horas
            aproximadas
          </span>
        </div>

        <h2 className="mt-10 text-xl font-extrabold text-slate-900">Temario</h2>
        <ol className="mt-4 space-y-4">
          {curso.tomos.map(tomo => (
            <li key={tomo.id} className="tarjeta p-5">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-bold text-slate-900">
                  Tomo {tomo.orden}: {tomo.titulo}
                </h3>
                <span className="whitespace-nowrap text-xs text-slate-500">
                  aprueba con {tomo.umbral}%
                </span>
              </div>
              {tomo.descripcion && (
                <p className="mt-1 text-sm text-slate-600">{tomo.descripcion}</p>
              )}
              <ul className="mt-3 space-y-1.5">
                {tomo.lecciones.map(leccion => (
                  <li key={leccion.id} className="flex justify-between text-sm text-slate-700">
                    <span>
                      {leccion.orden}. {leccion.titulo}
                    </span>
                    <span className="text-slate-400">{leccion.duracionMin} min</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>

      <aside className="lg:col-span-1">
        <div className="tarjeta sticky top-6 p-6">
          <p className="text-3xl font-extrabold text-marca-600">
            {precioTexto(curso.precio, curso.moneda)}
          </p>

          <div className="mt-5">
            {matricula ? (
              <Link href={`/aprender/${curso.slug}`} className="boton-exito w-full">
                Continuar el curso
              </Link>
            ) : !perfil ? (
              <a
                href={`/api/auth/login?destino=${encodeURIComponent(`/cursos/${curso.slug}`)}`}
                className="boton-primario w-full"
              >
                Entrar para empezar
              </a>
            ) : curso.precio === 0 ? (
              <BotonMatricularGratis cursoId={curso.id} slug={curso.slug} />
            ) : (
              <Link href={`/checkout/${curso.slug}`} className="boton-primario w-full">
                Comprar el curso
              </Link>
            )}
          </div>

          <ul className="mt-6 space-y-2 text-sm text-slate-600">
            <li>Acceso sin caducidad</li>
            <li>Insignia y certificado al completarlo</li>
            <li>Flashcards de repaso revisadas por una persona</li>
          </ul>
        </div>
      </aside>
    </div>
  )
}

export default DetalleCurso
