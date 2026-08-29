'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Celebracion } from '@/componentes/celebracion'

export const BotonCompletar = ({
  leccionId,
  cursoId,
  cursoSlug,
  yaCompletada,
  siguienteLeccionId,
  tomoId,
  cierraElTomo,
}: {
  leccionId: string
  cursoId: string
  cursoSlug: string
  yaCompletada: boolean
  siguienteLeccionId: string | null
  tomoId: string
  cierraElTomo: boolean
}): JSX.Element => {
  const router = useRouter()
  const [estado, setEstado] = useState<'listo' | 'enviando' | 'error'>('listo')
  const [celebrar, setCelebrar] = useState<{ titulo: string; detalle: string } | null>(null)

  const completar = async (): Promise<void> => {
    setEstado('enviando')
    const respuesta = await fetch('/api/completar-leccion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leccionId, cursoId }),
    })
    if (!respuesta.ok) {
      setEstado('error')
      return
    }
    const datos = (await respuesta.json()) as {
      tomoCompletado: boolean
      cursoCompletado: boolean
    }
    setEstado('listo')

    // Micro-celebración: animación de EVENTO, no de hover — permitida (doc 11 §4)
    if (datos.cursoCompletado) {
      setCelebrar({
        titulo: '¡Curso completado!',
        detalle: 'Tu insignia y tu certificado ya están en el panel.',
      })
      return
    }
    if (datos.tomoCompletado) {
      setCelebrar({ titulo: '¡Tomo completado!', detalle: 'Buen trabajo. Sigue así.' })
      return
    }
    avanzar()
  }

  const avanzar = (): void => {
    if (siguienteLeccionId) router.push(`/aprender/${cursoSlug}/${siguienteLeccionId}`)
    else if (cierraElTomo) router.push(`/aprender/${cursoSlug}/evaluacion/${tomoId}`)
    else router.push(`/aprender/${cursoSlug}`)
    router.refresh()
  }

  if (yaCompletada) {
    return (
      <div className="flex items-center gap-3">
        <span className="etiqueta bg-exito-100 text-exito-700">✓ Lección completada</span>
        {siguienteLeccionId && (
          <button type="button" onClick={avanzar} className="boton-primario">
            Siguiente lección
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void completar()}
        disabled={estado === 'enviando'}
        className="boton-primario"
      >
        {estado === 'enviando' ? 'Guardando…' : 'Completar lección'}
      </button>
      {estado === 'error' && (
        <p className="text-sm text-alerta-700" role="alert">
          No se pudo guardar. Revisa tu conexión y vuelve a intentarlo.
        </p>
      )}
      {celebrar && (
        <Celebracion
          titulo={celebrar.titulo}
          detalle={celebrar.detalle}
          alCerrar={() => {
            setCelebrar(null)
            avanzar()
          }}
        />
      )}
    </>
  )
}
