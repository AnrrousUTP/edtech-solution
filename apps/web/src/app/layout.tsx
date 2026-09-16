import type { Metadata } from 'next'
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google'
import Link from 'next/link'
import './globals.css'
import { perfilSesion } from '@/lib/sesion'
import SiteHeader from './site-header'
import AssistantWidget from '@/componentes/asistente'
import EdtechLogo from '@/componentes/edtech-logo'

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

        <footer id="footer" className="site-footer edtech-footer">
          <div className="edtech-footer-inner">
            <div className="edtech-footer-main">
              <div className="edtech-footer-brand">
                <EdtechLogo />
                <p>
                  Aprende habilidades prácticas, construye evidencia y avanza con una ruta que
                  puedes hacer tuya.
                </p>
              </div>
              <div className="edtech-footer-column">
                <strong>Explorar</strong>
                <Link href="/">Inicio</Link>
                <Link href="/cursos">Catálogo</Link>
                <Link href="/#rutas">Rutas de aprendizaje</Link>
              </div>
              <div className="edtech-footer-column">
                <strong>EdTech</strong>
                <Link href="/register">Crear cuenta</Link>
                <Link href="/login">Iniciar sesión</Link>
                <Link href="/#faq">Preguntas frecuentes</Link>
              </div>
              <div className="edtech-footer-column">
                <strong>Contacto</strong>
                <a href="mailto:hello@edtech.dev">hello@edtech.dev</a>
                <a href="/#contactanos">Hablemos</a>
              </div>
            </div>
            <div className="edtech-footer-bottom">
              <span>© 2026 EdTech</span>
              <span>Aprender haciendo, siempre.</span>
            </div>
          </div>
        </footer>

        <AssistantWidget />
      </body>
    </html>
  )
}

export default RootLayout
