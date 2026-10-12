'use client'

import Link from 'next/link'
import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'

type AuthMode = 'login' | 'register' | 'recover'

type AuthPhase = 'formulario' | 'confirmar' | 'reset' | 'mfa' | 'nueva-clave'

export const AuthForm = ({
  mode,
  local,
  destino,
}: {
  mode: AuthMode
  local: boolean
  destino: string
}): JSX.Element => {
  const [fase, setFase] = useState<AuthPhase>('formulario')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [codigo, setCodigo] = useState('')
  const [authSession, setAuthSession] = useState('')
  const [challengeName, setChallengeName] = useState('')
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
      const respuesta = await fetch(local ? '/api/auth/local' : '/api/auth/cognito', {
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
      setError('No se pudo conectar con el servicio de acceso. Inténtalo de nuevo.')
      return null
    } finally {
      setOcupada(false)
    }
  }

  const enviar = async (evento: FormEvent<HTMLFormElement>): Promise<void> => {
    evento.preventDefault()

    if (mode === 'login') {
      const cuerpo =
        fase === 'mfa' || fase === 'nueva-clave'
          ? await api('challenge', { email, session: authSession, challengeName, codigo, password })
          : await api('login', { email, password })
      if (cuerpo?.destino) window.location.href = String(cuerpo.destino)
      else if (cuerpo?.reto && cuerpo?.session) {
        setAuthSession(String(cuerpo.session))
        setChallengeName(String(cuerpo.reto))
        setFase(cuerpo.reto === 'SOFTWARE_TOKEN_MFA' ? 'mfa' : 'nueva-clave')
      }
      return
    }

    if (mode === 'register' && fase === 'formulario') {
      const cuerpo = await api('register', { nombre, email, password })
      if (cuerpo) {
        setFase('confirmar')
        setMensaje(
          local
            ? `Cuenta creada. En local usa el código ${String(cuerpo.codigoDesarrollo ?? '123456')} para confirmar.`
            : 'Te enviamos un código al correo para confirmar la cuenta.',
        )
      }
      return
    }

    if (mode === 'register' && fase === 'confirmar') {
      const cuerpo = await api('confirm', { email, codigo })
      if (cuerpo) {
        const sesion = await api('login', { email, password })
        if (sesion?.destino) window.location.href = String(sesion.destino)
        else if (sesion?.reto && sesion?.session) {
          setAuthSession(String(sesion.session))
          setChallengeName(String(sesion.reto))
          setFase(sesion.reto === 'SOFTWARE_TOKEN_MFA' ? 'mfa' : 'nueva-clave')
        } else if (sesion) {
          setMensaje('Correo confirmado. Ya puedes iniciar sesión.')
          setFase('formulario')
        }
      }
      return
    }

    if (mode === 'recover' && fase === 'formulario') {
      const cuerpo = await api('forgot', { email })
      if (cuerpo) {
        setFase('reset')
        setMensaje(
          local
            ? `Código enviado. En local usa ${String(cuerpo.codigoDesarrollo ?? '654321')}.`
            : 'Te enviamos un código para restablecer la contraseña.',
        )
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
  const esMfa = mode === 'login' && fase === 'mfa'
  const esNuevaClave = mode === 'login' && fase === 'nueva-clave'
  const titulo =
    mode === 'login'
      ? 'Entrar al sistema'
      : mode === 'register'
        ? 'Crear cuenta'
        : 'Recuperar acceso'

  return (
    <form className="auth-form" onSubmit={enviar}>
      {local && (
        <div className="auth-provider-note">
          <strong>Acceso seguro</strong>
          <span>Tu cuenta y tu progreso están protegidos.</span>
        </div>
      )}

      {mode === 'register' && fase === 'formulario' && (
        <label>
          Nombre visible
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ada Lovelace"
            required
          />
        </label>
      )}
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="correo@ejemplo.com"
          required
        />
      </label>
      {((mode === 'login' && fase === 'formulario') ||
        (mode === 'register' && fase === 'formulario')) && (
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••••"
            required
            minLength={mode === 'register' ? 10 : undefined}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />
        </label>
      )}
      {(esConfirmacion || esReset || esMfa) && (
        <label>
          {esMfa ? 'Código de tu app de autenticación' : 'Código de verificación'}
          <input
            inputMode="numeric"
            value={codigo}
            onChange={e => setCodigo(e.target.value)}
            placeholder="000000"
            autoComplete="one-time-code"
            required
          />
        </label>
      )}
      {esMfa && (
        <p className="auth-legal">Escribe el código de seis dígitos de tu app de autenticación.</p>
      )}
      {(esReset || esNuevaClave) && (
        <label>
          {esNuevaClave ? 'Crea una contraseña nueva' : 'Nueva contraseña'}
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••••"
            required
            minLength={10}
            autoComplete="new-password"
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
            : esConfirmacion
              ? 'Confirmar cuenta'
              : esReset
                ? 'Actualizar contraseña'
                : esMfa
                  ? 'Verificar código'
                  : esNuevaClave
                    ? 'Guardar contraseña nueva'
                    : titulo}
        <b aria-hidden="true">
          <svg className="inline-icon inline-arrow" viewBox="0 0 24 24">
            <path d="M5 12h13m-5-5 5 5-5 5" />
          </svg>
        </b>
      </button>

      {mode === 'login' && (
        <Link className="auth-recovery" href={`/recuperar?destino=${encodeURIComponent(destino)}`}>
          ¿Olvidaste tu contraseña?
        </Link>
      )}
      {mode === 'register' && (
        <p className="auth-legal">Al crear tu cuenta aceptas la política de uso de EdTech.</p>
      )}
      {mode === 'recover' && (
        <Link className="auth-recovery" href={`/login?destino=${encodeURIComponent(destino)}`}>
          Volver a iniciar sesión
        </Link>
      )}
    </form>
  )
}
