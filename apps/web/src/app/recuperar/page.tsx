import { AuthForm } from '../auth-form'
import { AuthShell } from '../auth-shell'
import { authLocalDisponible, hayCognito } from '@/lib/config'

const RecuperarPage = async (): Promise<JSX.Element> => {
  const local = !hayCognito() && authLocalDisponible()
  return (
    <AuthShell
      local={local}
      eyebrow="03 / RECOVERY"
      title="Recupera tu acceso."
      detail="La identidad es tuya. Restablece la sesión y vuelve al punto exacto de tu recorrido."
    >
      <AuthForm mode="recover" local={local} destino="/dashboard" />
    </AuthShell>
  )
}

export default RecuperarPage
