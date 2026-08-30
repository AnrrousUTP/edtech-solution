import type { Metadata } from 'next'
import { JetBrains_Mono, Nunito } from 'next/font/google'
import Link from 'next/link'
import './globals.css'
import { Racha } from '@/componentes/base'
import { gamificationApi } from '@/api/resto'
import { perfilSesion } from '@/lib/sesion'

// Doc 11 §3: Nunito (redondeada, amigable) para la UI y JetBrains Mono para
// código. Se cargan con next/font, que las AUTOHOSPEDA en el build: sin petición
// a Google en runtime, sin salto de maquetación al cargar y sin depender de que
// el navegador del alumno llegue a un tercero.
const nunito = Nunito({
  subsets: ['latin'],
  variable: '--fuente-ui',
  display: 'swap',
})
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--fuente-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'EdTech Solution — Aprende a programar por niveles',
  description:
    'Cursos de programación con progresión por niveles, gamificación y repaso asistido por IA.',
}

const RootLayout = async ({ children }: { children: React.ReactNode }): Promise<JSX.Element> => {
  const perfil = await perfilSesion()
  const esAdmin = perfil?.roles.includes('admin') ?? false

  // La racha vive en la barra superior (doc 11 §4). Si gamification no responde,
  // la barra se dibuja igual: una racha ausente no puede tumbar la navegación.
  const juego = perfil === null ? null : await gamificationApi.miPerfil().catch(() => null)

  return (
    <html lang="es" className={`${nunito.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-marca-600 focus:px-4 focus:py-2 focus:text-white"
        >
          Saltar al contenido
        </a>

        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
          <nav
            className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4"
            aria-label="Principal"
          >
            <Link href="/" className="mr-4 flex items-center gap-2" aria-label="EdTech, inicio">
              <span
                className="grid h-8 w-8 place-items-center rounded-lg bg-marca-600 text-sm font-extrabold text-white"
                aria-hidden="true"
              >
                E
              </span>
              <span className="text-base font-extrabold tracking-tight text-slate-900">EdTech</span>
            </Link>

            <Link href="/cursos" className="enlace-nav">
              Cursos
            </Link>
            {perfil !== null && (
              <Link href="/dashboard" className="enlace-nav">
                Mi panel
              </Link>
            )}
            {esAdmin && (
              <Link href="/admin" className="enlace-nav">
                Admin
              </Link>
            )}

            <div className="ml-auto flex items-center gap-3">
              {juego !== null && juego.rachaActual > 0 && <Racha dias={juego.rachaActual} />}
              {perfil !== null ? (
                <>
                  <span className="hidden text-sm font-bold text-slate-700 sm:inline">
                    {perfil.nombre}
                  </span>
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
