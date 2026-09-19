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
type IconoInsignia = 'inicio' | 'dominio' | 'ruta' | 'precision' | 'racha'

type MetaInsignia = {
  criterio: string
  nombre: string
  categoria: string
  descripcion: string
  comoSeGana: string
  icono: IconoInsignia
}

const CRITERIOS: MetaInsignia[] = [
  {
    criterio: 'PRIMER_CURSO',
    nombre: 'Primer despegue',
    categoria: 'Inicio',
    descripcion: 'Tu primera ruta de aprendizaje ya está en marcha.',
    comoSeGana: 'Completa tu primer curso',
    icono: 'inicio',
  },
  {
    criterio: 'CURSO_COMPLETADO',
    nombre: 'Ruta completada',
    categoria: 'Progreso',
    descripcion: 'Llegaste al final de un curso con todo el recorrido resuelto.',
    comoSeGana: 'Completa un curso',
    icono: 'ruta',
  },
  {
    criterio: 'CARRERA_COMPLETADA',
    nombre: 'Maestría de ruta',
    categoria: 'Dominio',
    descripcion: 'Un recorrido completo demuestra constancia y visión de conjunto.',
    comoSeGana: 'Completa una carrera entera',
    icono: 'dominio',
  },
  {
    criterio: 'EVALUACION_PERFECTA',
    nombre: 'Mente precisa',
    categoria: 'Dominio',
    descripcion: 'Cada respuesta estuvo en el lugar correcto.',
    comoSeGana: 'Saca 100% en una evaluación',
    icono: 'precision',
  },
  {
    criterio: 'RACHA_7',
    nombre: 'Ritmo de 7',
    categoria: 'Constancia',
    descripcion: 'Una semana seguida convierte el estudio en un hábito.',
    comoSeGana: 'Estudia 7 días seguidos',
    icono: 'racha',
  },
  {
    criterio: 'RACHA_30',
    nombre: 'Ritmo de 30',
    categoria: 'Constancia',
    descripcion: 'Treinta días de práctica sostienen un avance real.',
    comoSeGana: 'Estudia 30 días seguidos',
    icono: 'racha',
  },
  {
    criterio: 'RACHA_100',
    nombre: 'Ritmo legendario',
    categoria: 'Constancia',
    descripcion: 'Cien días de continuidad: tu disciplina habla por ti.',
    comoSeGana: 'Estudia 100 días seguidos',
    icono: 'racha',
  },
]

const IconoLogro = ({ tipo }: { tipo: IconoInsignia }): JSX.Element => {
  const contenido = {
    inicio: (
      <>
        <path d="M24 5 29 16l12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1 5-11Z" />
        <path d="m24 12 1.8 4.1 4.5.4-3.4 3 1 4.4-3.9-2.3-3.9 2.3 1-4.4-3.4-3 4.5-.4L24 12Z" />
      </>
    ),
    dominio: (
      <>
        <path d="M24 5 39 11v11c0 9-6.4 16.1-15 20-8.6-3.9-15-11-15-20V11l15-6Z" />
        <path d="m16 24 5 5 11-12" />
      </>
    ),
    ruta: (
      <>
        <path d="M12 9h24v28H12z" />
        <path d="M18 9V5h12v4M18 17h12M18 24h12M18 31h7" />
        <path d="m31 31 3 3 5-6" />
      </>
    ),
    precision: (
      <>
        <circle cx="24" cy="24" r="17" />
        <circle cx="24" cy="24" r="10" />
        <path d="m24 7 2.2 6.8L33 16l-6.8 2.2L24 25l-2.2-6.8L15 16l6.8-2.2L24 7Z" />
      </>
    ),
    racha: (
      <>
        <path d="M28 5c1 7-5 9-4 15 1-2 3-3 5-3 4 0 7 3 7 8 0 7-5 12-12 12S12 32 12 25c0-5 3-9 8-13-1 5 1 7 3 8-1-7 1-11 5-15Z" />
        <path d="M24 28c-2 2-3 4-3 6 0 2 1 3 3 3s3-1 3-3c0-2-1-4-3-6Z" />
      </>
    ),
  }[tipo]

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {contenido}
    </svg>
  )
}

const Dashboard = async (): Promise<JSX.Element> => {
  const sesion = await perfilSesion()
  if (!sesion) {
    return (
      <ErrorConAccion
        titulo="Entra para ver tu panel"
        detalle="Acá viven tu racha, tus insignias, tus certificados y los cursos que empezaste."
        accion={{ texto: 'Entrar', href: '/login?destino=/dashboard' }}
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
  const insigniasPorCriterio = new Map(
    (gamificacion?.insignias ?? []).map(insignia => [insignia.criterio, insignia]),
  )
  const insigniasGanadas = CRITERIOS.filter(insignia => obtenidas.has(insignia.criterio)).length
  const siguienteInsignia = CRITERIOS.find(insignia => !obtenidas.has(insignia.criterio))
  const porcentajeInsignias = Math.round((insigniasGanadas / CRITERIOS.length) * 100)

  return (
    <div className="tech-dashboard space-y-12">
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
        <div className="achievement-board__heading">
          <div>
            <span className="eyebrow">Colección de logros</span>
            <h2 className="mt-2 text-2xl font-extrabold text-slate-900">Tu vitrina de progreso</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Cada insignia representa una forma distinta de avanzar: empezar, dominar, completar y
              mantener tu ritmo.
            </p>
          </div>
          <div
            className="achievement-board__score"
            aria-label={`${insigniasGanadas} de ${CRITERIOS.length} insignias obtenidas`}
          >
            <span className="achievement-board__score-number">{insigniasGanadas}</span>
            <span className="achievement-board__score-total">/{CRITERIOS.length}</span>
            <span className="achievement-board__score-label">desbloqueadas</span>
          </div>
        </div>

        <div
          className="achievement-board__progress"
          aria-label={`Colección completada al ${porcentajeInsignias}%`}
        >
          <div className="achievement-board__progress-copy">
            <span>Progreso de colección</span>
            <strong>{porcentajeInsignias}%</strong>
          </div>
          <div className="achievement-board__progress-track">
            <span style={{ width: `${porcentajeInsignias}%` }} />
          </div>
          <p>
            {siguienteInsignia
              ? `Siguiente objetivo: ${siguienteInsignia.nombre}. ${siguienteInsignia.comoSeGana}.`
              : 'Colección completa. Ya desbloqueaste todos los logros disponibles.'}
          </p>
        </div>

        <ul className="achievement-board__grid mt-5">
          {CRITERIOS.map(insignia => {
            const ganada = obtenidas.has(insignia.criterio)
            const obtenidaAt = insigniasPorCriterio.get(insignia.criterio)?.otorgadaAt
            return (
              <li
                key={insignia.criterio}
                className={`achievement-card ${ganada ? 'is-earned' : 'is-locked'}`}
                aria-label={`${insignia.nombre}: ${ganada ? 'desbloqueada' : 'bloqueada'}`}
              >
                <div className="achievement-card__topline">
                  <span className="achievement-card__category">{insignia.categoria}</span>
                  <span className="achievement-card__state">
                    {ganada ? 'Desbloqueada' : 'Bloqueada'}
                  </span>
                </div>
                <div className="achievement-card__medallion-wrap">
                  <span className="achievement-card__medallion">
                    <IconoLogro tipo={insignia.icono} />
                  </span>
                  {ganada && <span className="achievement-card__ribbon">LOGRO</span>}
                </div>
                <h3>{insignia.nombre}</h3>
                <p className="achievement-card__description">
                  {ganada ? insignia.descripcion : insignia.comoSeGana}
                </p>
                <div className="achievement-card__footer">
                  <span>
                    {ganada && obtenidaAt
                      ? `Conseguida el ${new Date(obtenidaAt).toLocaleDateString('es-PE')}`
                      : 'Sigue avanzando'}
                  </span>
                  <span aria-hidden="true">{ganada ? '✓' : '···'}</span>
                </div>
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
