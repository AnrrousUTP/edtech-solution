import Link from 'next/link'
import { ErrorConAccion } from '@/componentes/base'
import { esAdmin, mfaPendiente } from '@/lib/sesion'
import { OtorgarCredencial } from './otorgar'

export default async function CertificadosAdmin(): Promise<JSX.Element> {
  if (!(await esAdmin()))
    return (
      <ErrorConAccion
        titulo="Necesitas permisos de administrador"
        detalle="Entra para gestionar credenciales."
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
  return (
    <div className="tech-admin-page">
      <Link href="/admin" className="admin-backlink">
        <svg className="inline-icon" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Administración
      </Link>
      <h1 className="admin-title">Credenciales que dejan evidencia.</h1>
      <p className="admin-lead">
        Los certificados se generan de forma asíncrona y mantienen una URL pública de verificación.
      </p>
      <OtorgarCredencial />
    </div>
  )
}
