import Link from 'next/link'
import { EditorCurso } from '../../editor-curso'
import { ErrorConAccion } from '@/componentes/base'
import { esDocente, mfaPendiente } from '@/lib/sesion'

export default async function NuevoCurso(): Promise<JSX.Element> {
  if (!(await esDocente()))
    return (
      <ErrorConAccion
        titulo="Necesitas el rol docente"
        detalle="Entra con una cuenta docente para crear contenido."
        accion={{ texto: 'Iniciar sesión', href: '/admin/login' }}
      />
    )
  if (await mfaPendiente())
    return (
      <ErrorConAccion
        titulo="Configura tu segundo factor para entrar"
        detalle="El área docente exige verificación en dos pasos."
        accion={{ texto: 'Configurarlo ahora', href: '/configurar-mfa' }}
      />
    )
  return (
    <div className="tech-admin-page">
      <Link href="/admin" className="admin-backlink">
        <svg className="inline-icon" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Área docente
      </Link>
      <EditorCurso curso={null} contenido={[]} />
    </div>
  )
}
