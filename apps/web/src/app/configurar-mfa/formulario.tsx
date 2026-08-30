'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Secreto = { secreto: string; uri: string }

// Pantalla de segundo factor del admin (doc 08 §6). Tiene estado y eventos, así
// que es cliente; el access token se queda en el servidor — de acá solo sale el
// código de 6 dígitos.
export const FormularioMfa = (): JSX.Element => {
  const router = useRouter()
  const [secreto, setSecreto] = useState<Secreto | null>(null)
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const pedirSecreto = async (): Promise<void> => {
    setOcupado(true)
    setError(null)
    const r = await fetch('/api/auth/mfa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accion: 'asociar' }),
    })
    const cuerpo = (await r.json()) as Secreto & { error?: string }
    setOcupado(false)
    if (!r.ok) {
      setError(cuerpo.error ?? 'No se pudo generar el secreto')
      return
    }
    setSecreto({ secreto: cuerpo.secreto, uri: cuerpo.uri })
  }

  const confirmar = async (evento: React.FormEvent): Promise<void> => {
    evento.preventDefault()
    setOcupado(true)
    setError(null)
    const r = await fetch('/api/auth/mfa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accion: 'confirmar', codigo }),
    })
    const cuerpo = (await r.json()) as { error?: string }
    setOcupado(false)
    if (!r.ok) {
      setError(cuerpo.error ?? 'El código no fue aceptado')
      return
    }
    router.push('/admin')
    router.refresh()
  }

  if (secreto === null) {
    return (
      <div className="tarjeta max-w-xl p-6">
        <p className="text-sm text-slate-700">
          El panel de administración exige un segundo factor. Vas a necesitar una app de
          autenticación (Google Authenticator, 1Password, Authy o la que uses).
        </p>
        <button
          type="button"
          className="boton-primario mt-5"
          onClick={pedirSecreto}
          disabled={ocupado}
        >
          {ocupado ? 'Generando…' : 'Empezar'}
        </button>
        {error !== null && <p className="mt-4 text-sm text-alerta-700">{error}</p>}
      </div>
    )
  }

  return (
    <form className="tarjeta max-w-xl p-6" onSubmit={confirmar}>
      <ol className="space-y-4 text-sm text-slate-700">
        <li>
          <span className="font-bold text-slate-900">1.</span> Agregá esta clave en tu app de
          autenticación:
          <code className="mt-2 block break-all rounded-lg bg-slate-100 p-3 font-mono text-xs">
            {secreto.secreto}
          </code>
          <span className="mt-2 block text-xs text-slate-500">
            Si tu app acepta un enlace en vez de la clave:{' '}
            <code className="break-all">{secreto.uri}</code>
          </span>
        </li>
        <li>
          <span className="font-bold text-slate-900">2.</span> Escribí el código de 6 dígitos que
          muestre:
          <input
            className="mt-2 w-40 rounded-lg border border-slate-300 px-3 py-2 font-mono text-lg tracking-widest focus:border-marca-600"
            value={codigo}
            onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="Código de verificación"
            placeholder="000000"
          />
        </li>
      </ol>

      {error !== null && <p className="mt-4 text-sm text-alerta-700">{error}</p>}

      <button
        type="submit"
        className="boton-primario mt-5"
        disabled={ocupado || codigo.length !== 6}
      >
        {ocupado ? 'Verificando…' : 'Activar el segundo factor'}
      </button>

      <p className="mt-4 text-xs text-slate-500">
        A partir de acá Cognito te va a pedir este código en cada inicio de sesión. Guardá la clave
        en un lugar seguro: sin la app no vas a poder entrar.
      </p>
    </form>
  )
}
