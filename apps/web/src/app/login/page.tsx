import { AuthForm } from '../auth-form'
import { AuthShell } from '../auth-shell'
import { authLocalDisponible, hayCognito } from '@/lib/config'

const LoginPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>
}): Promise<JSX.Element> => {
  const params = await searchParams
  const destino = params.destino?.startsWith('/') ? params.destino : '/dashboard'
  const local = !hayCognito() && authLocalDisponible()
  return (
    <AuthShell
      local={local}
      eyebrow="01 / LOGIN"
      title="Vuelve a construir."
      detail="Tu workspace conserva el progreso, las rutas y cada evidencia que ya dejaste."
    >
      <AuthForm mode="login" local={local} destino={destino} />
    </AuthShell>
  )
}

export default LoginPage
