'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

// Polling HONESTO tras capturar (doc 09 §2, paso 12): entre la captura y la
// matrícula pasan cientos de milisegundos, a veces segundos. Se consulta cada
// segundo durante 15 s; si no llega, se dice la verdad — nunca un error,
// porque el dinero ya se cobró y el evento está en camino.
type Fase = 'inicial' | 'creando' | 'capturando' | 'esperando' | 'listo' | 'demorado' | 'error'

const INTENTOS_MAXIMOS = 15

export const Checkout = ({
  cursoId,
  cursoSlug,
}: {
  cursoId: string
  cursoSlug: string
}): JSX.Element => {
  const router = useRouter()
  const parametros = useSearchParams()
  const [fase, setFase] = useState<Fase>('inicial')
  const [mensajeError, setMensajeError] = useState<string | null>(null)
  const [intentos, setIntentos] = useState(0)

  const ordenDeVuelta = parametros.get('orden')

  const comprar = async (): Promise<void> => {
    setFase('creando')
    setMensajeError(null)
    const respuesta = await fetch('/api/checkout/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursoId, cursoSlug }),
    })
    if (!respuesta.ok) {
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string }
      setMensajeError(cuerpo.error ?? 'No se pudo iniciar el pago.')
      setFase('error')
      return
    }
    const { urlAprobacion } = (await respuesta.json()) as { urlAprobacion: string }
    window.location.href = urlAprobacion
  }

  const capturar = useCallback(async (ordenId: string): Promise<void> => {
    setFase('capturando')
    const respuesta = await fetch('/api/checkout/capturar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordenId }),
    })
    if (!respuesta.ok) {
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string }
      setMensajeError(cuerpo.error ?? 'No pudimos confirmar el cobro.')
      setFase('error')
      return
    }
    setFase('esperando')
  }, [])

  // Al volver de PayPal: capturar
  useEffect(() => {
    if (ordenDeVuelta && fase === 'inicial') void capturar(ordenDeVuelta)
  }, [ordenDeVuelta, fase, capturar])

  // Esperar a que la matrícula quede ACTIVA (consistencia eventual)
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
    }, 1000)
    return () => clearTimeout(temporizador)
  }, [fase, intentos, cursoId, router])

  if (fase === 'listo') {
    return (
      <div className="tarjeta aparece mt-6 border-exito-500/40 bg-exito-100/40 p-8 text-center">
        <p className="text-5xl" aria-hidden="true">
          ✅
        </p>
        <h2 className="mt-4 text-xl font-extrabold text-slate-900">¡Curso habilitado!</h2>
        <p className="mt-2 text-slate-700">Ya puedes empezar cuando quieras.</p>
        <Link href={`/aprender/${cursoSlug}`} className="boton-exito mt-6">
          Empezar el curso
        </Link>
      </div>
    )
  }

  if (fase === 'esperando' || fase === 'capturando') {
    return (
      <div className="tarjeta mt-6 p-8 text-center" aria-live="polite">
        <p className="text-lg font-bold text-slate-900">Confirmando tu pago…</p>
        <p className="mt-2 text-sm text-slate-600">
          El cobro se realizó. Estamos habilitando tu curso; suele tardar unos segundos.
        </p>
        <div className="mx-auto mt-5 h-1.5 w-40 overflow-hidden rounded-lg bg-slate-200">
          <div className="h-full w-1/3 animate-pulse rounded-lg bg-marca-600" />
        </div>
      </div>
    )
  }

  if (fase === 'demorado') {
    return (
      <div className="tarjeta mt-6 border-acento-400/50 bg-acento-100/40 p-8 text-center">
        <p className="text-lg font-bold text-slate-900">Tu pago se confirmó</p>
        <p className="mt-2 text-sm text-slate-700">
          Estamos habilitando tu curso y está tardando un poco más de lo normal. No hace falta que
          pagues otra vez: aparecerá en tu panel en cuanto termine.
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
        disabled={fase === 'creando'}
        className="boton-primario w-full"
      >
        {fase === 'creando' ? 'Abriendo PayPal…' : 'Pagar con PayPal'}
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
        Te llevamos a PayPal para completar el pago de forma segura. No guardamos datos de tu
        tarjeta.
      </p>
    </div>
  )
}
