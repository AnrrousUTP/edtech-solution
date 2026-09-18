import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { ErrorConAccion } from '@/componentes/base'
import { esAdmin, mfaPendiente } from '@/lib/sesion'
import { GestorBancos } from './gestor'

export default async function BancosAdmin(): Promise<JSX.Element> {
  if (!(await esAdmin()))
    return (
      <ErrorConAccion
        titulo="Necesitas permisos de administrador"
        detalle="Entra para gestionar evaluaciones."
        accion={{ texto: 'Iniciar sesión', href: '/admin/login' }}
      />
    )
  if (await mfaPendiente())
    return (
      <ErrorConAccion
        titulo="Configura tu segundo factor para entrar"
        detalle="El panel de administración exige verificación en dos pasos."
        accion={{ texto: 'Configurarlo ahora', href: '/configurar-mfa' }}
      />
    )
  const [bancos, cursos] = await Promise.all([
    catalogApi.bancosAdmin().catch(() => []),
    catalogApi.cursosAdmin().catch(() => []),
  ])
  const detalles = await Promise.all(
    cursos.map(curso => catalogApi.cursoAdmin(curso.id).catch(() => null)),
  )
  const tomos = detalles
    .flatMap(curso => curso?.tomos ?? [])
    .map(tomo => ({ id: tomo.id, titulo: tomo.titulo }))
  const cursosDisponibles = cursos.map(curso => ({ id: curso.id, titulo: curso.titulo }))
  return (
    <div className="tech-admin-page">
      <Link href="/admin" className="admin-backlink">
        <svg className="inline-icon" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Administración
      </Link>
      <h1 className="admin-title">Diseña el nivel de cada misión.</h1>
      <p className="admin-lead">
        Conocimiento previo, refuerzo y certificación viven en bancos versionables.
      </p>
      <GestorBancos bancos={bancos} tomos={tomos} cursos={cursosDisponibles} />
    </div>
  )
}
