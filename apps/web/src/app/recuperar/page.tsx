import { AuthForm } from '../auth-form'
import { AuthShell } from '../auth-shell'
import { authLocalDisponible, destinoInterno, hayCognito } from '@/lib/config'

const RecuperarPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>
}): Promise<JSX.Element> => {
  const params = await searchParams
  const destino = destinoInterno(params.destino)
  const local = !hayCognito() && authLocalDisponible()
  return (
    <AuthShell
      local={local}
      eyebrow="03 / RECOVERY"
      title="Recupera tu acceso."
      detail="La identidad es tuya. Restablece la sesión y vuelve al punto exacto de tu recorrido."
      destino={destino}
    >
      <AuthForm mode="recover" local={local} destino={destino} />
    </AuthShell>
  )
}

export default RecuperarPage
