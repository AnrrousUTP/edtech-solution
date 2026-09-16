import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { ErrorConAccion } from '@/componentes/base'
import { esAdmin, mfaPendiente } from '@/lib/sesion'
import { GestorCarreras } from './gestor'

export default async function CarrerasAdmin(): Promise<JSX.Element> {
  if (!(await esAdmin()))
    return (
      <ErrorConAccion
        titulo="Necesitas permisos de administrador"
        detalle="Entra para gestionar rutas."
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
  const [carreras, cursos] = await Promise.all([
    catalogApi.carrerasAdmin().catch(() => []),
    catalogApi.cursosAdmin().catch(() => []),
  ])
  return (
    <div className="tech-admin-page">
      <Link href="/admin" className="admin-backlink">
        <svg className="inline-icon" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Administración
      </Link>
      <h1 className="admin-title">Rutas que conectan cursos.</h1>
      <p className="admin-lead">
        Ordena la progresión y publica recorridos completos para cada perfil.
      </p>
      <GestorCarreras
        carreras={carreras}
        cursos={cursos.map(c => ({ id: c.id, titulo: c.titulo }))}
      />
    </div>
  )
}
