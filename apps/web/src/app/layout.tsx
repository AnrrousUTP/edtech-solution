import type { Metadata } from 'next'
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google'
import Link from 'next/link'
import './globals.css'
import { perfilSesion } from '@/lib/sesion'
import SiteHeader from './site-header'

// Space Grotesk da a la interfaz una voz técnica y editorial. JetBrains Mono
// queda reservada para comandos, metadatos y estados del sistema.
const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--fuente-display',
  display: 'swap',
})
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--fuente-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'EdTech — Aprende habilidades para avanzar',
  description: 'Rutas prácticas para aprender tecnología, practicar y demostrar lo que sabes.',
}

const RootLayout = async ({ children }: { children: React.ReactNode }): Promise<JSX.Element> => {
  const perfil = await perfilSesion()

  return (
    <html lang="es" className={`${display.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-marca-600 focus:px-4 focus:py-2 focus:text-white"
        >
          Saltar al contenido
        </a>

        <SiteHeader perfil={perfil} />

        <main id="contenido" className="app-main mx-auto max-w-7xl px-4 py-8">
          {children}
        </main>

        <footer id="footer" className="site-footer tech-footer">
          <div className="tech-footer-inner">
            <div className="tech-footer-topline">
              <span>EDTECH / OPEN LEARNING SYSTEM</span>
              <span>
                <i /> ALL SYSTEMS OPERATIONAL
              </span>
            </div>
            <div className="tech-footer-grid">
              <div className="tech-footer-lead">
                <p className="tech-footer-label">END OF SESSION / 00</p>
                <h2>
                  Keep
                  <br />
                  <span>building.</span>
                </h2>
                <p>
                  Aprende tecnología construyendo evidencia que puedas volver a ejecutar, compartir
                  y mejorar.
                </p>
              </div>
              <div className="tech-footer-column">
                <p className="tech-footer-label">EXPLORE</p>
                <Link href="/">
                  Inicio <b>01</b>
                </Link>
                <Link href="/cursos">
                  Catálogo <b>02</b>
                </Link>
                <Link href="/#faq">
                  FAQ <b>03</b>
                </Link>
                <Link href="/#contactanos">
                  Contáctanos <b>04</b>
                </Link>
              </div>
              <div className="tech-footer-column">
                <p className="tech-footer-label">SYSTEM</p>
                <Link href="/register">
                  Register <b>↗</b>
                </Link>
                <Link href="/login">
                  Iniciar Sesión <b>↗</b>
                </Link>
                <a href="mailto:hello@edtech.dev">
                  Support <b>↗</b>
                </a>
                <span className="tech-footer-version">v0.1 / PYTHON PATH</span>
              </div>
              <div className="tech-footer-terminal">
                <div>
                  <span>edtech@workspace:~$</span>
                  <b>echo "see you at the next commit"</b>
                </div>
                <p>output</p>
                <strong>✓ ready for your next build</strong>
                <span className="tech-footer-cursor">▋</span>
              </div>
            </div>
            <div className="tech-footer-bottom">
              <span>© 2026 EDTECH / LEARN BY BUILDING</span>
              <span>
                PYTHON <i /> JAVASCRIPT <i /> SYSTEMS
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}

export default RootLayout
