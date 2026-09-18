'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { PerfilSesion } from '@/lib/sesion'
import EdtechLogo from '@/componentes/edtech-logo'

type SiteHeaderProps = {
  perfil: PerfilSesion | null
}

const linksPublicos = [
  { href: '/', label: 'Inicio', index: '01', key: 'home' },
  { href: '/cursos', label: 'Explorar', index: '02', key: 'catalog' },
  { href: '/#rutas', label: 'Rutas', index: '03', key: 'paths' },
  { href: '/#faq', label: 'Ayuda', index: '04', key: 'faq' },
] as const

const linksEstudiante = [
  { href: '/dashboard', label: 'Mi panel', index: '01', key: 'dashboard' },
  { href: '/cursos', label: 'Catálogo', index: '02', key: 'catalog' },
  { href: '/nivelacion', label: 'Nivelación', index: '03', key: 'level' },
  { href: '/diagnostico', label: 'Diagnóstico', index: '04', key: 'diagnostic' },
] as const

const linksAdmin = [
  { href: '/admin', label: 'Control', index: '01', key: 'admin' },
  { href: '/admin/cursos/nuevo', label: 'Cursos', index: '02', key: 'courses' },
  { href: '/admin/bancos', label: 'Evaluaciones', index: '03', key: 'assessments' },
  { href: '/admin/flashcards', label: 'Flashcards', index: '04', key: 'hitl' },
] as const

const SiteHeader = ({ perfil }: SiteHeaderProps): JSX.Element => {
  const pathname = usePathname()
  const [hash, setHash] = useState('')

  useEffect(() => {
    const updateHash = (): void => setHash(window.location.hash)
    updateHash()
    window.addEventListener('hashchange', updateHash)
    return () => window.removeEventListener('hashchange', updateHash)
  }, [])

  const esAdmin = perfil?.roles.includes('admin') ?? false
  const links = esAdmin ? linksAdmin : perfil ? linksEstudiante : linksPublicos
  const activeKey = esAdmin
    ? pathname === '/admin'
      ? 'admin'
      : pathname.startsWith('/admin/cursos')
        ? 'courses'
        : pathname.startsWith('/admin/bancos')
          ? 'assessments'
          : 'hitl'
    : perfil
      ? pathname === '/dashboard'
        ? 'dashboard'
        : pathname === '/nivelacion'
          ? 'level'
          : pathname === '/diagnostico'
            ? 'diagnostic'
            : 'catalog'
      : pathname === '/cursos' || pathname.startsWith('/cursos/')
        ? 'catalog'
        : pathname === '/' && hash === '#rutas'
          ? 'paths'
          : pathname === '/' && hash === '#faq'
            ? 'faq'
            : 'home'

  return (
    <header className="site-header sticky top-0 z-40">
      <nav
        className="header-space-nav mx-auto flex min-h-16 max-w-7xl items-center gap-1 px-4"
        aria-label="Principal"
      >
        <Link href="/" className="header-space-context" aria-label="EdTech, inicio">
          <EdtechLogo />
        </Link>

        <div className="header-public-nav" aria-label="Navegación pública">
          {links.map(link => (
            <Link
              key={link.key}
              href={link.href}
              className={link.key === activeKey ? 'is-active' : undefined}
              aria-current={link.key === activeKey ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          <Link href="/cursos" className="header-search-button" aria-label="Buscar cursos">
            <svg aria-hidden="true" className="header-icon" viewBox="0 0 24 24" fill="none">
              <path d="m20 20-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
            </svg>
          </Link>
          {perfil !== null ? (
            <>
              <Link href={esAdmin ? '/admin' : '/dashboard'} className="header-profile-name">
                {perfil.nombre}
              </Link>
              <a href="/api/auth/logout" className="header-login-button">
                Salir
              </a>
            </>
          ) : (
            <>
              <Link href="/register" className="header-register-button">
                Crear cuenta
              </Link>
              <Link href="/login" className="header-login-button">
                Entrar
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

export default SiteHeader
