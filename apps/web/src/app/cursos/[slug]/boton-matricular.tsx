'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

// 'use client' solo donde hay estado o eventos (doc 11 §1).
export const BotonMatricularGratis = ({
  cursoId,
  slug,
}: {
  cursoId: string
  slug: string
}): JSX.Element => {
  const router = useRouter()
  const [estado, setEstado] = useState<'listo' | 'enviando' | 'error'>('listo')

  const matricular = async (): Promise<void> => {
    setEstado('enviando')
    const respuesta = await fetch('/api/matricular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursoId }),
    })
    if (!respuesta.ok) {
      setEstado('error')
      return
    }
    router.push(`/aprender/${slug}`)
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void matricular()}
        disabled={estado === 'enviando'}
        className="boton-primario w-full"
      >
        {estado === 'enviando' ? 'Matriculando…' : 'Empezar gratis'}
      </button>
      {estado === 'error' && (
        <p className="mt-2 text-sm text-alerta-700" role="alert">
          No se pudo completar la matrícula. Inténtalo otra vez.
        </p>
      )}
    </div>
  )
}
