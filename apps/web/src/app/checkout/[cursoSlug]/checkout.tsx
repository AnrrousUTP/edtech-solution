'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type Fase = 'inicial' | 'comprando' | 'esperando' | 'listo' | 'demorado' | 'error'
const INTENTOS_MAXIMOS = 15

export const Checkout = ({
  cursoId,
  cursoSlug,
}: {
  cursoId: string
  cursoSlug: string
}): JSX.Element => {
  const router = useRouter()
  const [fase, setFase] = useState<Fase>('inicial')
  const [mensajeError, setMensajeError] = useState<string | null>(null)
  const [intentos, setIntentos] = useState(0)

  const comprar = async (): Promise<void> => {
    setFase('comprando')
    setMensajeError(null)
    const respuesta = await fetch('/api/checkout/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursoId, cursoSlug }),
    })
    if (!respuesta.ok) {
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string }
      setMensajeError(cuerpo.error ?? 'No se pudo completar la compra.')
      setFase('error')
      return
    }
    setFase('esperando')
  }

  useEffect(() => {
    if (fase !== 'esperando') return
    if (intentos >= INTENTOS_MAXIMOS) {
      setFase('demorado')
      return
    }
    const temporizador = setTimeout(async () => {
      const respuesta = await fetch(`/api/checkout/estado?cursoId=${cursoId}`)
      const { activa } = (await respuesta.json()) as { activa: boolean }
      if (activa) {
        setFase('listo')
        router.refresh()
      } else {
        setIntentos(n => n + 1)
      }
    }, 700)
    return () => clearTimeout(temporizador)
  }, [fase, intentos, cursoId, router])

  if (fase === 'listo') {
    return (
      <div className="tarjeta aparece mt-6 border-exito-500/40 bg-exito-100/40 p-8 text-center">
        <svg className="result-icon" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="18" />
          <path d="m14 24 7 7 14-15" />
        </svg>
        <h2 className="mt-4 text-xl font-extrabold text-slate-900">¡Compra completada!</h2>
        <p className="mt-2 text-slate-700">El curso ya está habilitado en tu cuenta.</p>
        <Link href={`/aprender/${cursoSlug}`} className="boton-exito mt-6">
          Empezar el curso
        </Link>
      </div>
    )
  }

  if (fase === 'esperando' || fase === 'comprando') {
    return (
      <div className="tarjeta mt-6 p-8 text-center" aria-live="polite">
        <p className="text-lg font-bold text-slate-900">
          {fase === 'comprando' ? 'Procesando tu compra…' : 'Habilitando tu curso…'}
        </p>
        <p className="mt-2 text-sm text-slate-600">Enseguida tendrás acceso al contenido.</p>
        <div className="mx-auto mt-5 h-1.5 w-40 overflow-hidden rounded-lg bg-slate-200">
          <div className="h-full w-1/3 animate-pulse rounded-lg bg-marca-600" />
        </div>
      </div>
    )
  }

  if (fase === 'demorado') {
    return (
      <div className="tarjeta mt-6 border-acento-400/50 bg-acento-100/40 p-8 text-center">
        <p className="text-lg font-bold text-slate-900">La compra se registró</p>
        <p className="mt-2 text-sm text-slate-700">
          Estamos habilitando el curso. Aparecerá en tu panel en cuanto termine.
        </p>
        <Link href="/dashboard" className="boton-primario mt-6">
          Ir a mi panel
        </Link>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => void comprar()}
        disabled={fase === 'comprando'}
        className="boton-primario w-full"
      >
        {fase === 'comprando' ? 'Procesando…' : 'Pagar y comprar'}
      </button>

      {mensajeError && (
        <div className="mt-4 rounded-lg bg-alerta-100 p-4 text-sm text-alerta-700" role="alert">
          <p>{mensajeError}</p>
          <button type="button" onClick={() => void comprar()} className="mt-3 font-bold underline">
            Reintentar
          </button>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-slate-500">
        Compra de demostración: se confirma al continuar; no se solicita información de pago.
      </p>
    </div>
  )
}
