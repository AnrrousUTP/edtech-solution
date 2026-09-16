'use client'

import { useEffect, useRef, useState } from 'react'

// Micro-celebración (doc 11 §4): overlay breve al completar un tomo o ganar una
// insignia. Es una animación de EVENTO, no de hover — permitida por D19.
// Con prefers-reduced-motion se muestra estática (sin confeti).
export const Celebracion = ({
  titulo,
  detalle,
  alCerrar,
}: {
  titulo: string
  detalle: string
  alCerrar: () => void
}): JSX.Element => {
  const [movimientoReducido, setMovimientoReducido] = useState(true)
  const dialogo = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMovimientoReducido(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    dialogo.current?.focus()
    const temporizador = setTimeout(alCerrar, 1500)
    return () => clearTimeout(temporizador)
  }, [alCerrar])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={alCerrar}
      role="presentation"
    >
      <div
        ref={dialogo}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-celebracion"
        tabIndex={-1}
        className="tarjeta aparece max-w-sm p-8 text-center"
        onClick={evento => evento.stopPropagation()}
        onKeyDown={evento => {
          if (evento.key === 'Escape') alCerrar()
        }}
      >
        <svg
          className={`celebration-icon ${movimientoReducido ? 'is-static' : ''}`}
          viewBox="0 0 48 48"
          aria-hidden="true"
        >
          <path d="M15 6h18v8a9 9 0 0 1-18 0V6Z" />
          <path d="M15 10H9a6 6 0 0 0 6 6M33 10h6a6 6 0 0 1-6 6M24 23v8M16 40h16M19 31h10" />
        </svg>
        <h2 id="titulo-celebracion" className="mt-4 text-2xl font-extrabold text-slate-900">
          {titulo}
        </h2>
        <p className="mt-2 text-slate-600">{detalle}</p>
        <button type="button" onClick={alCerrar} className="boton-primario mt-6">
          Continuar
        </button>
      </div>
    </div>
  )
}
