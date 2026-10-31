'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type Fase = 'confirmando' | 'listo' | 'pendiente' | 'error'
const ESPERA_MAXIMA = 45

export const ResultadoCheckout = ({ ordenId }: { ordenId: string }): JSX.Element => {
  const router = useRouter()
  const [fase, setFase] = useState<Fase>(ordenId ? 'confirmando' : 'error')

  useEffect(() => {
    if (!ordenId) return
    let cancelado = false
    const controlador = new AbortController()

    const esperar = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

    const confirmar = async (): Promise<void> => {
      try {
        await fetch('/api/checkout/capturar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ordenId }),
          cache: 'no-store',
          signal: controlador.signal,
        })
      } catch {
        // El estado de la orden y el webhook determinan el resultado final.
      }

      for (let intento = 0; intento < ESPERA_MAXIMA && !cancelado; intento += 1) {
        try {
          const respuestaOrden = await fetch(
            `/api/checkout/orden?ordenId=${encodeURIComponent(ordenId)}`,
            { cache: 'no-store', signal: controlador.signal },
          )
          if (
            respuestaOrden.status === 401 ||
            respuestaOrden.status === 403 ||
            respuestaOrden.status === 404
          ) {
            setFase('error')
            return
          }
          if (!respuestaOrden.ok) throw new Error('No se pudo leer la orden')
          const orden = (await respuestaOrden.json()) as { cursoId: string; estado: string }

          if (['FALLIDA', 'EXPIRADA', 'REEMBOLSADA'].includes(orden.estado)) {
            setFase('error')
            return
          }

          if (orden.estado === 'CAPTURADA') {
            const respuestaMatricula = await fetch(
              `/api/checkout/estado?cursoId=${encodeURIComponent(orden.cursoId)}`,
              { cache: 'no-store', signal: controlador.signal },
            )
            if (respuestaMatricula.ok) {
              const matricula = (await respuestaMatricula.json()) as { activa: boolean }
              if (matricula.activa) {
                if (cancelado) return
                setFase('listo')
                router.replace('/dashboard')
                return
              }
            }
          }
        } catch {
          if (cancelado) return
        }
        await esperar(1000)
      }

      if (!cancelado) setFase('pendiente')
    }

    void confirmar()
    return () => {
      cancelado = true
      controlador.abort()
    }
  }, [ordenId, router])

  if (fase === 'error') {
    return (
      <section className="tarjeta mt-6 p-8 text-center" role="status">
        <h1 className="text-xl font-extrabold text-slate-900">No se pudo confirmar el pago</h1>
        <p className="mt-2 text-slate-700">
          Revisa el estado de tu compra antes de volver a pagar.
        </p>
        <Link href="/dashboard" className="boton-primario mt-6">
          Ir a mi panel
        </Link>
      </section>
    )
  }

  if (fase === 'pendiente') {
    return (
      <section className="tarjeta mt-6 p-8 text-center" role="status">
        <h1 className="text-xl font-extrabold text-slate-900">Confirmación pendiente</h1>
        <p className="mt-2 text-slate-700">
          PayPal todavía procesa la respuesta. No repitas el pago; revisa tu panel en unos momentos.
        </p>
        <Link href="/dashboard" className="boton-primario mt-6">
          Ir a mi panel
        </Link>
      </section>
    )
  }

  return (
    <section className="tarjeta mt-6 p-8 text-center" aria-live="polite">
      <h1 className="text-xl font-extrabold text-slate-900">
        {fase === 'listo' ? 'Pago confirmado' : 'Confirmando tu pago…'}
      </h1>
      <p className="mt-2 text-slate-700">
        {fase === 'listo'
          ? 'Abriendo tu panel de aprendizaje.'
          : 'Estamos validando el pago y habilitando el curso.'}
      </p>
      <p className="mt-4 text-sm text-slate-500">Orden: {ordenId}</p>
    </section>
  )
}
