import Link from 'next/link'
import type { ReactNode } from 'react'

export const AuthShell = ({
  eyebrow,
  title,
  detail,
  local = false,
  children,
}: {
  eyebrow: string
  title: string
  detail: string
  local?: boolean
  children: ReactNode
}): JSX.Element => (
  <div className="auth-page">
    <div className="auth-page-grid" aria-hidden="true" />
    <div className="auth-layout">
      <section className="auth-intro">
        <h1>{title}</h1>
        <p className="auth-detail">{detail}</p>
        <div className="auth-terminal">
          <div>
            <span>edtech@identity:~$</span>
            <b>auth --secure</b>
          </div>
          <p>
            provider: <strong>{local ? 'JWT LOCAL' : 'AWS COGNITO'}</strong>
          </p>
          <p>
            session: <em>{local ? 'httpOnly / dev issuer' : 'httpOnly / PKCE'}</em>
          </p>
          <p>
            status: <i>ready</i>
          </p>
        </div>
        <nav className="auth-links" aria-label="Cuenta">
          <Link href="/login">Iniciar sesión</Link>
          <Link href="/register">Crear cuenta</Link>
        </nav>
      </section>
      <section className="auth-card" aria-label={eyebrow}>
        <p className="auth-card-label">{eyebrow}</p>
        {children}
      </section>
    </div>
  </div>
)
