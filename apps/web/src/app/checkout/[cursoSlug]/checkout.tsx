'use client'

import { useState } from 'react'

type Fase = 'inicial' | 'comprando' | 'error'

export const Checkout = ({ cursoId }: { cursoId: string }): JSX.Element => {
  const [fase, setFase] = useState<Fase>('inicial')
  const [mensajeError, setMensajeError] = useState<string | null>(null)

  const comprar = async (): Promise<void> => {
    setFase('comprando')
    setMensajeError(null)
    let respuesta: Response
    try {
      respuesta = await fetch('/api/checkout/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cursoId }),
        cache: 'no-store',
      })
    } catch {
      setMensajeError('No pudimos conectar. Verifica tu conexión e inténtalo de nuevo.')
      setFase('error')
      return
    }
    const orden = (await respuesta.json().catch(() => ({}))) as {
      error?: string
      urlAprobacion?: string
    }
    if (!respuesta.ok || !orden.urlAprobacion) {
      setMensajeError(orden.error ?? 'No se pudo iniciar el pago.')
      setFase('error')
      return
    }
    window.location.assign(orden.urlAprobacion)
  }

  if (fase === 'comprando') {
    return (
      <div className="tarjeta mt-6 p-8 text-center" aria-live="polite">
        <p className="text-lg font-bold text-slate-900">Conectando con PayPal…</p>
        <p className="mt-2 text-sm text-slate-600">Te redirigiremos para autorizar el pago.</p>
        <div className="mx-auto mt-5 h-1.5 w-40 overflow-hidden rounded-lg bg-slate-200">
          <div className="h-full w-1/3 animate-pulse rounded-lg bg-marca-600" />
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <button type="button" onClick={() => void comprar()} className="boton-primario w-full">
        Pagar y comprar
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
        El pago se procesa de forma segura en PayPal. El curso se habilita cuando se confirme.
      </p>
    </div>
  )
}
