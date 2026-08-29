'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BarraProgreso } from './base'

// Componente de examen: una pregunta por pantalla, navegable por teclado
// (doc 11 §6: 1..9 elige opción, Enter avanza). Lo usan la nivelación y la
// evaluación de tomo.
export type PreguntaExamen = {
  id: string
  tipo: string
  enunciado: string
  opciones: { id: string; texto: string }[]
  puntaje: number
}

export type ResultadoExamen = {
  puntaje: number
  aprobado: boolean
  nivelResultante: string | null
  tomoCompletado: boolean
  cursoCompletado: boolean
}

export const Examen = ({
  titulo,
  preguntas,
  bancoId,
  tipo,
  cursoId,
  tomoId,
  umbral,
  volverA,
}: {
  titulo: string
  preguntas: PreguntaExamen[]
  bancoId: string
  tipo: 'NIVELACION' | 'TOMO'
  cursoId?: string
  tomoId?: string
  umbral: number
  volverA: string
}): JSX.Element => {
  const router = useRouter()
  const [indice, setIndice] = useState(0)
  const [respuestas, setRespuestas] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoExamen | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pregunta = preguntas[indice]
  const esUltima = indice === preguntas.length - 1
  const respondidas = Object.keys(respuestas).length

  const entregar = async (): Promise<void> => {
    setEnviando(true)
    setError(null)
    const respuesta = await fetch('/api/entregar-intento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo,
        bancoId,
        cursoId,
        tomoId,
        respuestas: Object.entries(respuestas).map(([preguntaId, valor]) => ({
          preguntaId,
          respuesta: valor,
        })),
      }),
    })
    setEnviando(false)
    if (!respuesta.ok) {
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string }
      setError(cuerpo.error ?? 'No se pudo entregar. Inténtalo otra vez.')
      return
    }
    setResultado((await respuesta.json()) as ResultadoExamen)
    router.refresh()
  }

  // Navegación por teclado: el examen se usa sin ratón (doc 11 §6)
  useEffect(() => {
    if (resultado || !pregunta) return
    const alPulsar = (evento: KeyboardEvent): void => {
      const numero = Number(evento.key)
      if (numero >= 1 && numero <= pregunta.opciones.length) {
        const opcion = pregunta.opciones[numero - 1]
        if (opcion) setRespuestas(previo => ({ ...previo, [pregunta.id]: opcion.id }))
        return
      }
      if (evento.key === 'Enter' && respuestas[pregunta.id]) {
        if (esUltima) void entregar()
        else setIndice(i => i + 1)
      }
      if (evento.key === 'ArrowLeft' && indice > 0) setIndice(i => i - 1)
      if (evento.key === 'ArrowRight' && !esUltima) setIndice(i => i + 1)
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  })

  if (resultado) {
    return (
      <div className="tarjeta aparece mx-auto max-w-lg p-8 text-center">
        <p className="text-5xl" aria-hidden="true">
          {resultado.aprobado ? '🎉' : '📘'}
        </p>
        <h2 className="mt-4 text-2xl font-extrabold text-slate-900">
          {tipo === 'NIVELACION'
            ? 'Test completado'
            : resultado.aprobado
              ? '¡Evaluación aprobada!'
              : 'Aún no alcanzas el mínimo'}
        </h2>
        <p className="mt-3 text-4xl font-extrabold text-marca-600">{resultado.puntaje}%</p>

        {tipo === 'NIVELACION' && resultado.nivelResultante && (
          <p className="mt-4 text-slate-700">
            Tu nivel es <strong className="text-marca-600">{resultado.nivelResultante}</strong>. Ya
            puedes ver los cursos recomendados para ti.
          </p>
        )}
        {tipo === 'TOMO' && !resultado.aprobado && (
          <p className="mt-4 text-slate-700">
            Necesitas {umbral}% para aprobar. Repasa el tomo y vuelve a intentarlo: los intentos no
            se limitan y tu nivel nunca baja.
          </p>
        )}
        {resultado.cursoCompletado && (
          <p className="mt-4 font-bold text-exito-700">
            Completaste el curso: tu insignia y tu certificado ya están en el panel.
          </p>
        )}

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href={volverA} className="boton-primario">
            Continuar
          </Link>
          <Link href="/dashboard" className="boton-secundario">
            Ir a mi panel
          </Link>
        </div>
      </div>
    )
  }

  if (!pregunta) {
    return (
      <div className="tarjeta p-8 text-center">
        <p className="text-slate-700">Esta evaluación todavía no tiene preguntas.</p>
        <Link href={volverA} className="boton-secundario mt-4">
          Volver
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-slate-900">{titulo}</h1>
        <span className="text-sm text-slate-500">
          {indice + 1} de {preguntas.length}
        </span>
      </div>

      <div className="mt-4">
        <BarraProgreso valor={respondidas} total={preguntas.length} etiqueta="Respondidas" />
      </div>

      <fieldset className="tarjeta mt-8 p-6">
        <legend className="sr-only">Pregunta {indice + 1}</legend>
        <p className="text-lg font-bold text-slate-900">{pregunta.enunciado}</p>

        <div className="mt-5 space-y-2.5" role="radiogroup" aria-label="Opciones">
          {pregunta.opciones.map((opcion, i) => {
            const elegida = respuestas[pregunta.id] === opcion.id
            return (
              <button
                key={opcion.id}
                type="button"
                role="radio"
                aria-checked={elegida}
                onClick={() => setRespuestas(previo => ({ ...previo, [pregunta.id]: opcion.id }))}
                className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                  elegida
                    ? 'border-marca-600 bg-marca-50 font-bold text-marca-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-marca-400 hover:bg-marca-50'
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                    elegida ? 'bg-marca-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                {opcion.texto}
              </button>
            )
          })}
        </div>
      </fieldset>

      <p className="mt-3 text-xs text-slate-500">
        Con el teclado: <kbd className="font-mono">1</kbd>–
        <kbd className="font-mono">{pregunta.opciones.length}</kbd> elige,{' '}
        <kbd className="font-mono">Enter</kbd> avanza, <kbd className="font-mono">←</kbd>{' '}
        <kbd className="font-mono">→</kbd> navega.
      </p>

      {error && (
        <p className="mt-4 rounded-lg bg-alerta-100 p-3 text-sm text-alerta-700" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIndice(i => Math.max(0, i - 1))}
          disabled={indice === 0}
          className="boton-secundario"
        >
          Anterior
        </button>

        {esUltima ? (
          <button
            type="button"
            onClick={() => void entregar()}
            disabled={enviando || respondidas === 0}
            className="boton-primario"
          >
            {enviando ? 'Corrigiendo…' : 'Entregar'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIndice(i => i + 1)}
            disabled={!respuestas[pregunta.id]}
            className="boton-primario"
          >
            Siguiente
          </button>
        )}
      </div>
    </div>
  )
}
