'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { BarraProgreso } from '@/componentes/base'

type Tarjeta = { id: string; orden: number; anverso: string; reverso: string }

// Tarjeta volteable. D19: el hover cambia color y borde, nunca transform.
// Teclado (doc 11 §6): espacio voltea, 1 = lo sabía, 2 = no lo sabía.
export const Mazo = ({ tarjetas }: { tarjetas: Tarjeta[] }): JSX.Element => {
  const [indice, setIndice] = useState(0)
  const [volteada, setVolteada] = useState(false)
  const [aciertos, setAciertos] = useState(0)
  const [terminado, setTerminado] = useState(false)

  const tarjeta = tarjetas[indice]

  const responder = (acerto: boolean): void => {
    if (acerto) setAciertos(n => n + 1)
    if (indice === tarjetas.length - 1) {
      setTerminado(true)
      return
    }
    setIndice(i => i + 1)
    setVolteada(false)
  }

  useEffect(() => {
    if (terminado) return
    const alPulsar = (evento: KeyboardEvent): void => {
      if (evento.code === 'Space') {
        evento.preventDefault()
        setVolteada(v => !v)
        return
      }
      if (!volteada) return
      if (evento.key === '1') responder(true)
      if (evento.key === '2') responder(false)
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  })

  if (terminado) {
    return (
      <div className="tarjeta aparece mx-auto max-w-lg p-8 text-center">
        <p className="text-5xl" aria-hidden="true">
          🧠
        </p>
        <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Repaso terminado</h1>
        <p className="mt-3 text-slate-700">
          Acertaste <strong className="text-marca-600">{aciertos}</strong> de {tarjetas.length}.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            className="boton-primario"
            onClick={() => {
              setIndice(0)
              setAciertos(0)
              setVolteada(false)
              setTerminado(false)
            }}
          >
            Repasar otra vez
          </button>
          <Link href="/dashboard" className="boton-secundario">
            Volver al panel
          </Link>
        </div>
      </div>
    )
  }

  if (!tarjeta) return <div />

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-slate-900">Repaso</h1>
        <span className="text-sm text-slate-500">
          {indice + 1} de {tarjetas.length}
        </span>
      </div>

      <div className="mt-4">
        <BarraProgreso valor={indice} total={tarjetas.length} etiqueta="Tarjetas vistas" />
      </div>

      <button
        type="button"
        onClick={() => setVolteada(v => !v)}
        aria-expanded={volteada}
        className={`mt-8 flex min-h-64 w-full flex-col items-center justify-center rounded-xl border-2 p-8 text-center transition-colors ${
          volteada
            ? 'border-marca-600 bg-marca-50'
            : 'border-slate-200 bg-white hover:border-marca-400 hover:bg-marca-50'
        }`}
      >
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {volteada ? 'Respuesta' : 'Pregunta'}
        </span>
        <span className="mt-4 text-xl font-bold text-slate-900">
          {volteada ? tarjeta.reverso : tarjeta.anverso}
        </span>
        {!volteada && (
          <span className="mt-6 text-sm text-slate-500">
            Pulsa la tarjeta o <kbd className="font-mono">espacio</kbd> para ver la respuesta
          </span>
        )}
      </button>

      {volteada && (
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => responder(true)} className="boton-exito">
            Lo sabía <kbd className="font-mono text-xs opacity-70">1</kbd>
          </button>
          <button
            type="button"
            onClick={() => responder(false)}
            className="boton border border-alerta-500 bg-white text-alerta-700 hover:bg-alerta-100"
          >
            No lo sabía <kbd className="font-mono text-xs opacity-70">2</kbd>
          </button>
        </div>
      )}
    </div>
  )
}
