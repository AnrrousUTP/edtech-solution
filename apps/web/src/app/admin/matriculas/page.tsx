import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { ErrorConAccion } from '@/componentes/base'
import { esAdmin, mfaPendiente } from '@/lib/sesion'
import { OtorgarMatricula } from './otorgar'

export default async function MatriculasAdmin(): Promise<JSX.Element> {
  if (!(await esAdmin()))
    return (
      <ErrorConAccion
        titulo="Necesitas permisos de administrador"
        detalle="Entra para gestionar accesos."
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
  const cursos = await catalogApi.cursosAdmin().catch(() => [])
  return (
    <div className="tech-admin-page">
      <Link href="/admin" className="admin-backlink">
        <svg className="inline-icon" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Administración
      </Link>
      <h1 className="admin-title">Acceso para cada trayectoria.</h1>
      <p className="admin-lead">
        Concede una matrícula manual cuando el acceso llega por beca, soporte o una cohorte privada.
      </p>
      <OtorgarMatricula cursos={cursos.map(curso => ({ id: curso.id, titulo: curso.titulo }))} />
    </div>
  )
}
