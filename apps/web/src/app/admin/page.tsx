import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { ErrorConAccion, Etiqueta, precioTexto } from '@/componentes/base'
import { esAdmin, mfaPendiente } from '@/lib/sesion'
import { AccionesCurso } from './acciones-curso'

// Pantalla 12: panel de admin. La autorización REAL la hace el servidor
// (requiereRol('admin') en cada servicio): ocultar el enlace no es autorización.
const PanelAdmin = async (): Promise<JSX.Element> => {
  if (!(await esAdmin())) {
    return (
      <ErrorConAccion
        titulo="Necesitas permisos de administrador"
        detalle="Esta sección es para gestionar el catálogo. Si crees que deberías tener acceso, pídeselo a quien administra la plataforma."
        accion={{ texto: 'Iniciar sesión', href: '/admin/login' }}
      />
    )
  }

  if (await mfaPendiente()) {
    return (
      <ErrorConAccion
        titulo="Configura tu segundo factor para entrar"
        detalle="El panel de administración exige verificación en dos pasos (doc 08 §6). Toma un minuto."
        accion={{ texto: 'Configurarlo ahora', href: '/configurar-mfa' }}
      />
    )
  }

  const [cursos, bancos] = await Promise.all([
    catalogApi.cursosAdmin().catch(() => []),
    catalogApi.bancosAdmin().catch(() => []),
  ])
  const detalles = await Promise.all(
    cursos.map(curso => catalogApi.cursoAdmin(curso.id).catch(() => null)),
  )
  const detallePorCurso = new Map(
    detalles
      .filter((detalle): detalle is NonNullable<typeof detalle> => detalle !== null)
      .map(detalle => [detalle.id, detalle]),
  )
  const totalSemanas = detalles.reduce((total, detalle) => total + (detalle?.tomos.length ?? 0), 0)
  const totalEvaluaciones = bancos.filter(banco => banco.preguntas.length > 0).length
  const publicado = cursos.filter(curso => curso.estado === 'PUBLICADO').length

  const estadoCurso = (cursoId: string) => {
    const detalle = detallePorCurso.get(cursoId)
    const semanas = detalle?.tomos ?? []
    const bancosCurso = bancos.filter(banco => banco.cursoId === cursoId)
    const testInicial = bancosCurso.some(
      banco => banco.uso === 'EVALUACION_INICIAL' && banco.preguntas.length > 0,
    )
    const contenido = semanas.length > 0 && semanas.every(semana => semana.lecciones.length > 0)
    const repasos =
      semanas.length > 0 &&
      semanas.every(semana =>
        bancos.some(
          banco =>
            banco.tomoId === semana.id && banco.uso === 'REFUERZO' && banco.preguntas.length > 0,
        ),
      )
    const evaluaciones =
      semanas.length > 0 &&
      semanas.every(semana =>
        bancos.some(
          banco =>
            banco.tomoId === semana.id &&
            banco.uso === 'EVALUACION_TOMO' &&
            banco.preguntas.length > 0,
        ),
      )
    return { detalle, semanas, testInicial, contenido, repasos, evaluaciones }
  }

  return (
    <div className="tech-admin-page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="admin-section-kicker">CENTRO ACADÉMICO</p>
          <h1 className="text-3xl font-extrabold text-slate-900">
            Diseña tus rutas de aprendizaje
          </h1>
          <p className="admin-lead mt-2">
            Organiza cursos, semanas, evaluaciones y materiales desde el mismo mapa que verá cada
            estudiante.
          </p>
        </div>
        <nav className="flex flex-wrap gap-3">
          <Link href="/admin/cursos/nuevo" className="boton-primario text-xs">
            Crear curso
          </Link>
          <Link href="/admin/carreras" className="boton-secundario text-xs">
            Rutas
          </Link>
          <Link href="/admin/bancos" className="boton-secundario text-xs">
            Evaluaciones
          </Link>
          <Link href="/admin/flashcards" className="boton-secundario text-xs">
            Flashcards
          </Link>
          <Link href="/admin/metricas" className="boton-secundario text-xs">
            Métricas
          </Link>
        </nav>
      </div>

      <section className="admin-overview-grid" aria-label="Resumen académico">
        {[
          ['Cursos', cursos.length, 'en el catálogo'],
          ['Publicados', publicado, 'listos para estudiantes'],
          ['Semanas', totalSemanas, 'dentro de las rutas'],
          ['Evaluaciones', totalEvaluaciones, 'con preguntas configuradas'],
        ].map(([titulo, valor, detalle]) => (
          <div key={String(titulo)} className="admin-overview-card">
            <span>{titulo}</span>
            <strong>{valor}</strong>
            <small>{detalle}</small>
          </div>
        ))}
      </section>

      <div className="mt-10 flex items-end justify-between gap-4">
        <div>
          <p className="admin-section-kicker">CONTENIDO Y PROGRESIÓN</p>
          <h2 className="text-2xl font-extrabold text-slate-900">Tus cursos</h2>
        </div>
        <span className="text-sm text-slate-500">Cada tarjeta representa una ruta completa</span>
      </div>

      <div className="admin-course-grid mt-4">
        {cursos.map(curso => {
          const estado = estadoCurso(curso.id)
          const checks = [
            ['Test inicial', estado.testInicial],
            ['Contenido', estado.contenido],
            ['Repaso', estado.repasos],
            ['Evaluación semanal', estado.evaluaciones],
          ] as const
          const listos = checks.filter(([, listo]) => listo).length
          return (
            <article key={curso.id} className="admin-course-card">
              <div className="admin-course-card-topline">
                <span className="admin-course-tech">{curso.tecnologia}</span>
                <Etiqueta
                  tono={
                    curso.estado === 'PUBLICADO'
                      ? 'exito'
                      : curso.estado === 'BORRADOR'
                        ? 'neutro'
                        : 'alerta'
                  }
                >
                  {curso.estado}
                </Etiqueta>
              </div>
              <h3>{curso.titulo}</h3>
              <p className="admin-course-description">{curso.descripcion}</p>
              <div className="admin-course-stats">
                <span>
                  <strong>{estado.semanas.length}</strong> semanas
                </span>
                <span>
                  <strong>
                    {estado.semanas.reduce((total, semana) => total + semana.lecciones.length, 0)}
                  </strong>{' '}
                  lecciones
                </span>
                <span>{precioTexto(curso.precio, curso.moneda)}</span>
              </div>
              <div className="admin-readiness">
                <div className="admin-readiness-heading">
                  <span>Preparación de la ruta</span>
                  <strong>{listos}/4</strong>
                </div>
                <div className="admin-readiness-bar">
                  <span style={{ width: `${(listos / checks.length) * 100}%` }} />
                </div>
                <div className="admin-readiness-checks">
                  {checks.map(([label, listo]) => (
                    <span key={label} className={listo ? 'is-ready' : ''}>
                      {listo ? '✓' : '○'} {label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="admin-course-actions">
                <Link href={`/admin/cursos/${curso.id}`} className="boton-primario text-xs">
                  Abrir diseño
                </Link>
                <Link href={`/cursos/${curso.slug}`} className="boton-secundario text-xs">
                  Vista pública
                </Link>
              </div>
              <div className="admin-course-footer">
                <Link href={`/admin/bancos?curso=${curso.id}`}>Editar evaluaciones</Link>
                <AccionesCurso
                  cursoId={curso.id}
                  estado={curso.estado}
                  precio={curso.precio}
                  moneda={curso.moneda}
                />
              </div>
            </article>
          )
        })}
      </div>

      {cursos.length === 0 && (
        <p className="mt-6 text-sm text-slate-600">
          No hay cursos todavía. Créalos con la API de admin o con el seed (
          <code className="font-mono">bun run db:seed</code>).
        </p>
      )}
    </div>
  )
}

export default PanelAdmin
