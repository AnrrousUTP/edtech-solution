'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export const AccionesCurso = ({
  cursoId,
  estado,
  precio,
  moneda,
}: {
  cursoId: string
  estado: string
  precio: number
  moneda: string
}): JSX.Element => {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editandoPrecio, setEditandoPrecio] = useState(false)
  const [nuevoPrecio, setNuevoPrecio] = useState(precio.toFixed(2))

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
    setEditandoPrecio(false)
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
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
            onClick={() => void ejecutar('despublicar', { motivo: 'Retirado por el admin' })}
            className="boton-secundario px-3 py-1.5 text-xs"
          >
            Despublicar
          </button>
        )}
        <button
          type="button"
          disabled={ocupado}
          onClick={() => setEditandoPrecio(v => !v)}
          className="boton-secundario px-3 py-1.5 text-xs"
        >
          Precio
        </button>
      </div>

      {editandoPrecio && (
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`precio-${cursoId}`}>
            Nuevo precio en {moneda}
          </label>
          <input
            id={`precio-${cursoId}`}
            type="number"
            min="0"
            step="0.01"
            value={nuevoPrecio}
            onChange={evento => setNuevoPrecio(evento.target.value)}
            className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void ejecutar('precio', { precio: Number(nuevoPrecio) })}
            className="boton-primario px-3 py-1.5 text-xs"
          >
            Guardar
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-alerta-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
