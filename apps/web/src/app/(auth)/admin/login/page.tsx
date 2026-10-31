import Link from 'next/link'
import { AuthForm } from '../../../auth-form'
import { AuthShell } from '../../../auth-shell'
import { authLocalDisponible, hayCognito } from '@/lib/config'

const AdminLoginPage = async (): Promise<JSX.Element> => {
  const local = !hayCognito() && authLocalDisponible()
  return (
    <AuthShell
      local={local}
      eyebrow="ÁREA DOCENTE / ACCESO"
      title="Controla el sistema."
      detail="El rol docente gestiona cursos, métricas y material de estudio. El acceso se valida en el servidor."
    >
      <AuthForm mode="login" local={local} destino="/admin" />
      {local && (
        <Link className="auth-dev-link" href="/api/auth/local?rol=docente&destino=/admin">
          Sesión docente local de prueba{' '}
          <svg className="inline-icon inline-arrow" aria-hidden="true" viewBox="0 0 24 24">
            <path d="M5 12h13m-5-5 5 5-5 5" />
          </svg>
        </Link>
      )}
    </AuthShell>
  )
}

export default AdminLoginPage
