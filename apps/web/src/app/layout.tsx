import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'
import { perfilSesion } from '@/lib/sesion'

export const metadata: Metadata = {
  title: 'EdTech Solution — Aprende a programar por niveles',
  description:
    'Cursos de programación con progresión por niveles, gamificación y repaso asistido por IA.',
}

const RootLayout = async ({ children }: { children: React.ReactNode }): Promise<JSX.Element> => {
  const perfil = await perfilSesion()
  const esAdmin = perfil?.roles.includes('admin') ?? false

  return (
    <html lang="es">
      <body className="min-h-screen">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-marca-600 focus:px-4 focus:py-2 focus:text-white"
        >
          Saltar al contenido
        </a>

        <header className="border-b border-slate-200 bg-white">
          <nav
            className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3"
            aria-label="Principal"
          >
            <Link href="/" className="text-lg font-extrabold text-marca-600">
              EdTech
            </Link>
            <Link
              href="/cursos"
              className="text-sm font-bold text-slate-600 transition-colors hover:text-marca-600"
            >
              Cursos
            </Link>
            {perfil && (
              <Link
                href="/dashboard"
                className="text-sm font-bold text-slate-600 transition-colors hover:text-marca-600"
              >
                Mi panel
              </Link>
            )}
            {esAdmin && (
              <Link
                href="/admin"
                className="text-sm font-bold text-slate-600 transition-colors hover:text-marca-600"
              >
                Admin
              </Link>
            )}

            <div className="ml-auto flex items-center gap-3">
              {perfil ? (
                <>
                  <span className="hidden text-sm text-slate-600 sm:inline">{perfil.nombre}</span>
                  <a href="/api/auth/logout" className="boton-secundario text-xs">
                    Salir
                  </a>
                </>
              ) : (
                <a href="/api/auth/login" className="boton-primario text-xs">
                  Entrar
                </a>
              )}
            </div>
          </nav>
        </header>

        <main id="contenido" className="mx-auto max-w-6xl px-4 py-8">
          {children}
        </main>

        <footer className="mt-16 border-t border-slate-200 bg-white py-6">
          <div className="mx-auto max-w-6xl px-4 text-sm text-slate-500">
            EdTech Solution — HTML, CSS y Express, de la primera etiqueta a tu primera API.
          </div>
        </footer>
      </body>
    </html>
  )
}

export default RootLayout
