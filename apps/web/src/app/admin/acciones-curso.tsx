'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export const AccionesCurso = ({
  cursoId,
  estado,
}: {
  cursoId: string
  estado: string
}): JSX.Element => {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ejecutar = async (accion: string, cuerpo: Record<string, unknown> = {}): Promise<void> => {
    setOcupado(true)
    setError(null)
    const respuesta = await fetch('/api/admin/curso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursoId, accion, ...cuerpo }),
    })
    setOcupado(false)
    if (!respuesta.ok) {
      const datos = (await respuesta.json().catch(() => ({}))) as { error?: string }
      setError(datos.error ?? 'No se pudo completar la acción')
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {estado !== 'PUBLICADO' ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void ejecutar('publicar')}
            className="boton-primario px-3 py-1.5 text-xs"
          >
            Publicar
          </button>
        ) : (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void ejecutar('despublicar', { motivo: 'Retirado por docente' })}
            className="admin-icon-button"
            aria-label="Despublicar curso"
            title="Despublicar curso"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
              <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-alerta-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
