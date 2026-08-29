import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { enrollmentApi } from '@/api/enrollment'
import { gamificationApi, identityApi } from '@/api/resto'
import {
  BarraProgreso,
  ErrorConAccion,
  Etiqueta,
  NivelBadge,
  Racha,
  Vacio,
} from '@/componentes/base'
import { perfilSesion } from '@/lib/sesion'

// Pantalla 10: dashboard con racha, puntos, insignias, certificados y cursos.
const CRITERIOS: { criterio: string; nombre: string; comoSeGana: string }[] = [
  { criterio: 'PRIMER_CURSO', nombre: 'Primer curso', comoSeGana: 'Completa tu primer curso' },
  { criterio: 'CURSO_COMPLETADO', nombre: 'Curso completado', comoSeGana: 'Completa un curso' },
  {
    criterio: 'CARRERA_COMPLETADA',
    nombre: 'Carrera completa',
    comoSeGana: 'Completa una carrera entera',
  },
  {
    criterio: 'EVALUACION_PERFECTA',
    nombre: 'Evaluación perfecta',
    comoSeGana: 'Saca 100% en una evaluación',
  },
  { criterio: 'RACHA_7', nombre: 'Racha de 7', comoSeGana: 'Estudia 7 días seguidos' },
  { criterio: 'RACHA_30', nombre: 'Racha de 30', comoSeGana: 'Estudia 30 días seguidos' },
  { criterio: 'RACHA_100', nombre: 'Racha de 100', comoSeGana: 'Estudia 100 días seguidos' },
]

const Dashboard = async (): Promise<JSX.Element> => {
  const sesion = await perfilSesion()
  if (!sesion) {
    return (
      <ErrorConAccion
        titulo="Entra para ver tu panel"
        detalle="Acá viven tu racha, tus insignias, tus certificados y los cursos que empezaste."
        accion={{ texto: 'Entrar', href: '/api/auth/login?destino=/dashboard' }}
      />
    )
  }

  const [perfil, gamificacion, matriculas, cursos] = await Promise.all([
    identityApi.yo().catch(() => null),
    gamificationApi.miPerfil().catch(() => null),
    enrollmentApi.misMatriculas().catch(() => []),
    catalogApi.cursos().catch(() => []),
  ])

  const slugDe = (cursoId: string): string | undefined => cursos.find(c => c.id === cursoId)?.slug
  const obtenidas = new Set((gamificacion?.insignias ?? []).map(i => i.criterio))

  return (
    <div className="space-y-12">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900">
              Hola, {perfil?.nombreVisible ?? sesion.nombre}
            </h1>
            {perfil && (
              <div className="mt-2 flex items-center gap-2">
                <NivelBadge nivel={perfil.nivel} />
                {perfil.origenNivel === 'AUTODECLARADO' && (
                  <Link
                    href="/nivelacion"
                    className="text-xs font-bold text-marca-600 transition-colors hover:text-marca-700"
                  >
                    Hacer el test para ajustar tu nivel
                  </Link>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Racha dias={gamificacion?.rachaActual ?? 0} />
            <span className="etiqueta bg-marca-100 text-marca-700">
              {gamificacion?.puntos ?? 0} puntos
            </span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-extrabold text-slate-900">Mis cursos</h2>
        {matriculas.length === 0 ? (
          <div className="mt-4">
            <Vacio
              titulo="Todavía no empezaste ningún curso"
              detalle="Elige uno del catálogo o haz el test de nivelación para que te recomendemos por dónde empezar."
              accion={{ texto: 'Ver el catálogo', href: '/cursos' }}
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {matriculas.map(matricula => {
              const slug = slugDe(matricula.cursoId)
              const contenido = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold text-slate-900">{matricula.cursoTitulo ?? 'Curso'}</h3>
                    {matricula.estado !== 'ACTIVA' && (
                      <Etiqueta tono="alerta">{matricula.estado}</Etiqueta>
                    )}
                  </div>
                  <div className="mt-4">
                    <BarraProgreso
                      valor={matricula.tomosCompletados}
                      total={matricula.totalTomos ?? 0}
                      etiqueta="Tomos completados"
                    />
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    {matricula.leccionesCompletadas} lecciones completadas
                  </p>
                </>
              )
              return slug ? (
                <Link
                  key={matricula.matriculaId}
                  href={`/aprender/${slug}`}
                  className="tarjeta-interactiva block p-5"
                >
                  {contenido}
                </Link>
              ) : (
                <div key={matricula.matriculaId} className="tarjeta p-5">
                  {contenido}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-extrabold text-slate-900">Insignias</h2>
        <p className="mt-1 text-sm text-slate-600">
          Las que aún no tienes muestran cómo se ganan: saber qué falta motiva más que ver un hueco.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {CRITERIOS.map(insignia => {
            const ganada = obtenidas.has(insignia.criterio)
            return (
              <li
                key={insignia.criterio}
                className={`tarjeta p-4 text-center ${ganada ? 'border-acento-400/50 bg-acento-100/40' : ''}`}
              >
                <span
                  className={`text-3xl ${ganada ? '' : 'opacity-30 grayscale'}`}
                  aria-hidden="true"
                >
                  🏅
                </span>
                <p
                  className={`mt-2 text-sm font-bold ${ganada ? 'text-slate-900' : 'text-slate-500'}`}
                >
                  {insignia.nombre}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {ganada ? 'Obtenida' : insignia.comoSeGana}
                </p>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-extrabold text-slate-900">Certificados</h2>
        {(gamificacion?.certificados.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            Completa un curso para conseguir tu primer certificado.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {gamificacion?.certificados.map(certificado => (
              <li key={certificado.id} className="tarjeta flex flex-wrap items-center gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Etiqueta tono={certificado.tipo === 'MAYOR' ? 'acento' : 'exito'}>
                      {certificado.tipo === 'MAYOR' ? 'Certificado mayor' : 'Certificado menor'}
                    </Etiqueta>
                    {!certificado.pdfDisponible && <Etiqueta>PDF en preparación</Etiqueta>}
                  </div>
                  <p className="mt-2 font-bold text-slate-900">{certificado.titulo}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {certificado.codigoVerificacion}
                  </p>
                </div>
                <Link
                  href={`/certificados/${certificado.codigoVerificacion}`}
                  className="boton-secundario text-xs"
                >
                  Ver y verificar
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default Dashboard
