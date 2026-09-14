import { AuthForm } from '../auth-form'
import { AuthShell } from '../auth-shell'
import { authLocalDisponible, hayCognito } from '@/lib/config'

const RegisterPage = async (): Promise<JSX.Element> => {
  const local = !hayCognito() && authLocalDisponible()
  return (
    <AuthShell
      local={local}
      eyebrow="02 / REGISTER"
      title="Crea tu identidad."
      detail="Empieza en Python, construye evidencia y abre nuevas rutas con cada nivel demostrado."
    >
      <AuthForm mode="register" local={local} destino="/dashboard" />
    </AuthShell>
  )
}

export default RegisterPage
