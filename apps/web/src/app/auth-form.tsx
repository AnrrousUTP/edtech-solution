'use client'

import Link from 'next/link'
import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'

type AuthMode = 'login' | 'register' | 'recover'

export const AuthForm = ({
  mode,
  local,
  destino,
}: {
  mode: AuthMode
  local: boolean
  destino: string
}): JSX.Element => {
  const [fase, setFase] = useState<'formulario' | 'confirmar' | 'reset'>('formulario')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [codigo, setCodigo] = useState('')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupada, setOcupada] = useState(false)
  const [lista, setLista] = useState(false)

  useEffect(() => {
    setLista(true)
  }, [])

  const api = async (
    accion: string,
    datos: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> => {
    setOcupada(true)
    setError(null)
    setMensaje(null)
    try {
      const respuesta = await fetch('/api/auth/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, destino, ...datos }),
      })
      const cuerpo = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>
      if (!respuesta.ok) {
        setError(String(cuerpo.error ?? 'No se pudo completar la operación'))
        return null
      }
      return cuerpo
    } catch {
      setError('No se pudo conectar con el proveedor de identidad local')
      return null
    } finally {
      setOcupada(false)
    }
  }

  const enviar = async (evento: FormEvent<HTMLFormElement>): Promise<void> => {
    evento.preventDefault()
    if (!local) {
      window.location.href = `/api/auth/login?destino=${encodeURIComponent(destino)}${mode === 'register' ? '&modo=registro' : ''}`
      return
    }

    if (mode === 'login') {
      const cuerpo = await api('login', { email, password })
      if (cuerpo) window.location.href = String(cuerpo.destino ?? destino)
      return
    }

    if (mode === 'register' && fase === 'formulario') {
      const cuerpo = await api('register', { nombre, email, password })
      if (cuerpo) {
        setFase('confirmar')
        setMensaje(
          `Cuenta creada. En local usa el código ${String(cuerpo.codigoDesarrollo ?? '123456')} para confirmar.`,
        )
      }
      return
    }

    if (mode === 'register' && fase === 'confirmar') {
      const cuerpo = await api('confirm', { email, codigo })
      if (cuerpo) {
        setMensaje('Cuenta confirmada. Ya puedes iniciar sesión.')
        setFase('formulario')
      }
      return
    }

    if (mode === 'recover' && fase === 'formulario') {
      const cuerpo = await api('forgot', { email })
      if (cuerpo) {
        setFase('reset')
        setMensaje(`Código enviado. En local usa ${String(cuerpo.codigoDesarrollo ?? '654321')}.`)
      }
      return
    }

    const cuerpo = await api('reset', { email, codigo, password })
    if (cuerpo) {
      setMensaje('Contraseña actualizada. Ya puedes iniciar sesión.')
      setFase('formulario')
    }
  }

  const esConfirmacion = mode === 'register' && fase === 'confirmar'
  const esReset = mode === 'recover' && fase === 'reset'
  const titulo =
    mode === 'login'
      ? 'Entrar al sistema'
      : mode === 'register'
        ? 'Crear identidad'
        : 'Recuperar acceso'

  return (
    <form className="auth-form" onSubmit={enviar}>
      {!local && (
        <div className="auth-provider-note">
          <strong>AWS Cognito activo</strong>
          <span>Serás dirigido al Hosted UI seguro de la plataforma.</span>
        </div>
      )}

      {mode === 'register' && !esConfirmacion && (
        <label>
          Nombre visible
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ada Lovelace"
            required={local}
          />
        </label>
      )}
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@workspace.dev"
          required={local}
        />
      </label>
      {mode !== 'recover' && !esConfirmacion && (
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••••"
            required={local}
            minLength={10}
          />
        </label>
      )}
      {(esConfirmacion || esReset) && (
        <label>
          Código de verificación
          <input
            inputMode="numeric"
            value={codigo}
            onChange={e => setCodigo(e.target.value)}
            placeholder={esConfirmacion ? '123456' : '654321'}
            required={local}
          />
        </label>
      )}
      {esReset && (
        <label>
          Nueva contraseña
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••••"
            required={local}
            minLength={10}
          />
        </label>
      )}

      {error && (
        <p className="auth-feedback is-error" role="alert">
          {error}
        </p>
      )}
      {mensaje && (
        <p className="auth-feedback is-success" role="status">
          {mensaje}
        </p>
      )}

      <button type="submit" disabled={ocupada || !lista} className="auth-submit">
        {!lista
          ? 'Preparando…'
          : ocupada
            ? 'Procesando…'
            : !local
              ? 'Continuar con Cognito'
              : esConfirmacion
                ? 'Confirmar cuenta'
                : esReset
                  ? 'Actualizar contraseña'
                  : titulo}
        <b aria-hidden="true">
          <svg className="inline-icon inline-arrow" viewBox="0 0 24 24">
            <path d="M5 12h13m-5-5 5 5-5 5" />
          </svg>
        </b>
      </button>

      {mode === 'login' && (
        <Link className="auth-recovery" href="/recuperar">
          ¿Olvidaste tu contraseña?
        </Link>
      )}
      {mode === 'register' && (
        <p className="auth-legal">Al crear tu cuenta aceptas la política de uso de EdTech.</p>
      )}
      {mode === 'recover' && (
        <Link className="auth-recovery" href="/login">
          Volver a iniciar sesión
        </Link>
      )}
    </form>
  )
}
