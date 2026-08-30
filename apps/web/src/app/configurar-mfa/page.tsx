import { redirect } from 'next/navigation'
import { ErrorConAccion } from '@/componentes/base'
import { esAdmin, mfaPendiente, perfilSesion } from '@/lib/sesion'
import { FormularioMfa } from './formulario'

// Segundo factor obligatorio para el grupo `admin` (doc 08 §6). Cognito no
// permite exigir MFA por grupo de forma nativa: la Lambda pre_token_generation
// marca el token con `mfa_pendiente` y esta pantalla es el bloqueo.
const ConfigurarMfa = async (): Promise<JSX.Element> => {
  const perfil = await perfilSesion()
  if (perfil === null) redirect('/api/auth/login?destino=/configurar-mfa')

  if (!(await esAdmin())) {
    return (
      <ErrorConAccion
        titulo="Esta pantalla es para administradores"
        detalle="Tu cuenta no necesita un segundo factor para usar la plataforma."
        accion={{ texto: 'Ir a mis cursos', href: '/dashboard' }}
      />
    )
  }

  if (!(await mfaPendiente())) {
    return (
      <ErrorConAccion
        titulo="Tu segundo factor ya está configurado"
        detalle="No hace falta que hagas nada más."
        accion={{ texto: 'Ir al panel', href: '/admin' }}
      />
    )
  }

  return (
    <div>
      <h1 className="text-3xl font-extrabold text-slate-900">Configura tu segundo factor</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Tu cuenta está en el grupo <code className="font-mono text-sm">admin</code>. Antes de entrar
        al panel tenés que activar la verificación en dos pasos.
      </p>
      <div className="mt-6">
        <FormularioMfa />
      </div>
    </div>
  )
}

export default ConfigurarMfa
