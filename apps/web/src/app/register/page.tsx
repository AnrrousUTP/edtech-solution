import { AuthForm } from '../auth-form'
import { AuthShell } from '../auth-shell'
import { authLocalDisponible, destinoInterno, hayCognito } from '@/lib/config'

const RegisterPage = async ({
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
      eyebrow="02 / REGISTER"
      title="Crea tu identidad."
      detail="Empieza en Python, construye evidencia y abre nuevas rutas con cada nivel demostrado."
      destino={destino}
    >
      <AuthForm mode="register" local={local} destino={destino} />
    </AuthShell>
  )
}

export default RegisterPage
