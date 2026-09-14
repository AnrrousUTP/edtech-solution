import Link from 'next/link'
import { AuthForm } from '../../auth-form'
import { AuthShell } from '../../auth-shell'
import { authLocalDisponible, hayCognito } from '@/lib/config'

const AdminLoginPage = async (): Promise<JSX.Element> => {
  const local = !hayCognito() && authLocalDisponible()
  return (
    <AuthShell
      local={local}
      eyebrow="ADMIN / ACCESS"
      title="Controla el sistema."
      detail="El panel administra cursos, métricas y material de estudio. El rol se valida en el servidor."
    >
      <AuthForm mode="login" local={local} destino="/admin" />
      {local && (
        <Link className="auth-dev-link" href="/api/auth/local?rol=admin&destino=/admin">
          Sesión admin local de prueba ↗
        </Link>
      )}
    </AuthShell>
  )
}

export default AdminLoginPage
