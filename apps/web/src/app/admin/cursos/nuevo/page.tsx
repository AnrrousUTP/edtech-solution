import Link from 'next/link'
import { EditorCurso } from '../../editor-curso'
import { ErrorConAccion } from '@/componentes/base'
import { esAdmin, mfaPendiente } from '@/lib/sesion'

export default async function NuevoCurso(): Promise<JSX.Element> {
  if (!(await esAdmin()))
    return (
      <ErrorConAccion
        titulo="Necesitas permisos de administrador"
        detalle="Entra con una cuenta administradora para crear contenido."
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
        ← Administración
      </Link>
      <EditorCurso curso={null} contenido={[]} />
    </div>
  )
}
