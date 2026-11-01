'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { BancoAdmin } from '@/api/catalog'

type UsoBanco =
  | 'DIAGNOSTICO_PREVIO'
  | 'EVALUACION_INICIAL'
  | 'NIVELACION'
  | 'EVALUACION_TOMO'
  | 'REFUERZO'
  | 'CONOCIMIENTO_PREVIO_TOMO'

type FormularioBanco = {
  uso: UsoBanco
  tomoId: string
  cursoId: string
  titulo: string
  preguntas: string
}

type PreguntaVista = {
  enunciado: string
  opciones: { id: string; texto: string }[]
  respuestaCorrecta: string
}

const crearFormulario = (seleccion: {
  cursoId: string
  tomoId: string
  uso?: string
}): FormularioBanco => {
  const usosValidos: UsoBanco[] = [
    'DIAGNOSTICO_PREVIO',
    'NIVELACION',
    'EVALUACION_TOMO',
    'REFUERZO',
    'CONOCIMIENTO_PREVIO_TOMO',
  ]
  const uso = usosValidos.includes(seleccion.uso as UsoBanco)
    ? (seleccion.uso as UsoBanco)
    : seleccion.tomoId
      ? 'EVALUACION_TOMO'
      : 'DIAGNOSTICO_PREVIO'
  return {
    uso,
    tomoId:
      uso === 'EVALUACION_TOMO' || uso === 'REFUERZO' || uso === 'CONOCIMIENTO_PREVIO_TOMO'
        ? seleccion.tomoId
        : '',
    cursoId:
      uso === 'EVALUACION_INICIAL' || uso === 'EVALUACION_TOMO' || uso === 'REFUERZO'
        ? seleccion.cursoId
        : '',
    titulo: '',
    preguntas: '[]',
  }
}

const preguntasParaVista = (contenido: string): PreguntaVista[] => {
  try {
    const datos: unknown = JSON.parse(contenido)
    if (!Array.isArray(datos)) return []
    return datos.flatMap((valor): PreguntaVista[] => {
      if (!valor || typeof valor !== 'object') return []
      const pregunta = valor as Record<string, unknown>
      if (typeof pregunta.enunciado !== 'string' || !Array.isArray(pregunta.opciones)) return []
      const opciones = pregunta.opciones.flatMap((opcion): PreguntaVista['opciones'] => {
        if (!opcion || typeof opcion !== 'object') return []
        const fila = opcion as Record<string, unknown>
        return typeof fila.id === 'string' && typeof fila.texto === 'string'
          ? [{ id: fila.id, texto: fila.texto }]
          : []
      })
      return [
        {
          enunciado: pregunta.enunciado,
          opciones,
          respuestaCorrecta: String(pregunta.respuestaCorrecta ?? ''),
        },
      ]
    })
  } catch {
    return []
  }
}

export const GestorBancos = ({
  bancos,
  tomos,
  cursos,
  seleccionInicial = { cursoId: '', tomoId: '' },
}: {
  bancos: BancoAdmin[]
  tomos: { id: string; titulo: string; cursoId: string; cursoTitulo: string }[]
  cursos: { id: string; titulo: string }[]
  seleccionInicial?: { cursoId: string; tomoId: string; uso?: string }
}): JSX.Element => {
  const router = useRouter()
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const actual = bancos.find(banco => banco.bancoId === seleccion)
  const [form, setForm] = useState<FormularioBanco>(() => crearFormulario(seleccionInicial))
  const [feedback, setFeedback] = useState<{ tipo: 'error' | 'success'; texto: string } | null>(
    null,
  )
  const [ocupado, setOcupado] = useState(false)
  const preguntaVista = preguntasParaVista(form.preguntas)
  const tomoSeleccionado = tomos.find(tomo => tomo.id === form.tomoId)
  const puedeGenerar =
    (form.uso === 'EVALUACION_TOMO' && Boolean(form.tomoId && tomoSeleccionado))

  const nuevoBanco = (): void => {
    setSeleccion(null)
    setForm(crearFormulario(seleccionInicial))
    setFeedback(null)
  }

  const cargar = (banco: BancoAdmin): void => {
    setSeleccion(banco.bancoId)
    setForm({
      uso: banco.uso as UsoBanco,
      tomoId: banco.tomoId ?? '',
      cursoId: banco.cursoId ?? '',
      titulo: banco.titulo,
      preguntas: JSON.stringify(banco.preguntas, null, 2),
    })
    setFeedback(null)
  }

  const generar = async (): Promise<void> => {
    const cursoId = tomoSeleccionado?.cursoId
    if (!cursoId || !puedeGenerar) return
    setOcupado(true)
    setFeedback(null)
    try {
      const respuesta = await fetch('/api/assistant/generate-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uso: form.uso,
          cursoId,
          ...(form.uso === 'EVALUACION_TOMO' ? { tomoId: form.tomoId } : {}),
        }),
      })
      const datos = (await respuesta.json()) as {
        titulo?: string
        preguntas?: unknown[]
        error?: string
      }
      if (!respuesta.ok || !Array.isArray(datos.preguntas)) {
        throw new Error(datos.error ?? 'No se pudo generar la evaluación')
      }
      setSeleccion(null)
      setForm(actualForm => ({
        ...actualForm,
        titulo: datos.titulo ?? 'Evaluación generada con IA',
        preguntas: JSON.stringify(datos.preguntas, null, 2),
      }))
      setFeedback({
        tipo: 'success',
        texto: 'Borrador generado. Revisa las respuestas y guarda para habilitar la evaluación.',
      })
    } catch (error) {
      setFeedback({
        tipo: 'error',
        texto: error instanceof Error ? error.message : 'No se pudo generar la evaluación.',
      })
    } finally {
      setOcupado(false)
    }
  }

  const guardar = async (evento: React.FormEvent): Promise<void> => {
    evento.preventDefault()
    setOcupado(true)
    setFeedback(null)
    try {
      const preguntas: unknown = JSON.parse(form.preguntas)
      if (!Array.isArray(preguntas)) throw new Error('Las preguntas deben ser una lista válida.')
      const respuesta = await fetch('/api/admin/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: actual ? 'actualizar-banco' : 'crear-banco',
          ...(actual ? { id: actual.bancoId } : {}),
          datos: {
            ...form,
            tomoId: form.tomoId || null,
            cursoId: form.cursoId || null,
            preguntas,
          },
        }),
      })
      const datos = (await respuesta.json()) as { error?: string }
      if (!respuesta.ok) throw new Error(datos.error ?? 'No se pudo guardar')
      setFeedback({ tipo: 'success', texto: 'Banco guardado.' })
      setSeleccion(null)
      router.refresh()
    } catch (error) {
      setFeedback({
        tipo: 'error',
        texto:
          error instanceof Error ? error.message : 'Revisa las preguntas e inténtalo otra vez.',
      })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="admin-two-column admin-bank-layout">
      <section className="tech-admin-card">
        <div className="flex items-center justify-between gap-3">
          <h2>Evaluaciones</h2>
          <button type="button" className="boton-secundario text-xs" onClick={nuevoBanco}>
            Nueva
          </button>
        </div>
        <div className="mt-5 space-y-2">
          {bancos.map(banco => (
            <button
              key={banco.bancoId}
              type="button"
              onClick={() => cargar(banco)}
              className={`admin-list-row ${seleccion === banco.bancoId ? 'is-selected' : ''}`}
            >
              <span>
                <strong>{banco.titulo}</strong>
                <small>
                  {banco.uso} · {banco.preguntas.length} preguntas
                </small>
              </span>
              <span className="admin-status">
                {banco.cursoId ? 'CURSO' : banco.tomoId ? 'SEMANA' : 'GLOBAL'}
              </span>
            </button>
          ))}
          {bancos.length === 0 && <p className="admin-help">Aún no hay evaluaciones.</p>}
        </div>
      </section>

      <form className="tech-admin-card admin-bank-form" onSubmit={guardar}>
        <div className="admin-bank-form-heading">
          <div>
            <span className="admin-course-tech">
              {actual ? 'BANCO EXISTENTE' : 'NUEVA EVALUACIÓN'}
            </span>
            <h2>{actual ? 'Editar evaluación' : 'Crear evaluación'}</h2>
          </div>
        </div>
        <div className="admin-form-grid">
          <label className="admin-form-wide">
            Título
            <input
              required
              value={form.titulo}
              onChange={evento => setForm({ ...form, titulo: evento.target.value })}
            />
          </label>
          <label>
            Tipo de evaluación
            <select
              value={form.uso}
              onChange={evento => {
                const uso = evento.target.value as UsoBanco
                setForm(actualForm => ({
                  ...actualForm,
                  uso,
                  tomoId:
                    uso === 'EVALUACION_TOMO' || uso === 'REFUERZO' || uso === 'CONOCIMIENTO_PREVIO_TOMO'
                      ? actualForm.tomoId
                      : '',
                  cursoId: uso === 'EVALUACION_INICIAL' ? actualForm.cursoId : '',
                }))
              }}
            >
              <option value="DIAGNOSTICO_PREVIO">Conocimiento previo general</option>
              {actual?.uso === 'EVALUACION_INICIAL' && (
                <option value="EVALUACION_INICIAL" disabled>Test inicial histórico · solo lectura</option>
              )}
              <option value="CONOCIMIENTO_PREVIO_TOMO">Conocimiento previo semanal</option>
              <option value="REFUERZO">Repaso semanal</option>
              <option value="NIVELACION">Nivelación general</option>
              <option value="EVALUACION_TOMO">Evaluación semanal</option>
            </select>
          </label>

          {(form.uso === 'EVALUACION_TOMO' || form.uso === 'REFUERZO' || form.uso === 'CONOCIMIENTO_PREVIO_TOMO') && (
            <label>
              Semana
              <select
                required
                value={form.tomoId}
                onChange={evento => {
                  const tomoId = evento.target.value
                  setForm({
                    ...form,
                    tomoId,
                    cursoId: tomos.find(tomo => tomo.id === tomoId)?.cursoId ?? '',
                  })
                }}
              >
                <option value="">Selecciona una semana</option>
                {tomos.map(tomo => (
                  <option key={tomo.id} value={tomo.id}>
                    {tomo.cursoTitulo} · {tomo.titulo}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {form.uso === 'EVALUACION_INICIAL' && actual ? (
          <p className="admin-help">Banco histórico conservado para auditoría; no se publica desde el flujo semanal.</p>
        ) : form.uso === 'EVALUACION_TOMO' && (
          <section className="admin-ai-generation-panel">
            <div>
              <strong>Generar preguntas con IA</strong>
              <p>Usa los PDFs y lecciones guardados. Revisa el borrador antes de guardarlo.</p>
            </div>
            <button
              type="button"
              className="boton-primario"
              disabled={ocupado || !puedeGenerar}
              onClick={() => void generar()}
            >
              {ocupado ? 'Generando…' : 'Generar evaluación'}
            </button>
          </section>
        )}

        {preguntaVista.length > 0 ? (
          <section className="admin-ai-question-preview" aria-label="Preguntas para revisar">
            <div className="admin-ai-question-heading">
              <div>
                <h3>Revisa el borrador</h3>
                <p>{preguntaVista.length} preguntas · respuesta correcta marcada</p>
              </div>
            </div>
            {preguntaVista.map((pregunta, indice) => (
              <article className="admin-ai-question" key={`${indice}-${pregunta.enunciado}`}>
                <strong>
                  {indice + 1}. {pregunta.enunciado}
                </strong>
                <ul>
                  {pregunta.opciones.map(opcion => (
                    <li
                      key={opcion.id}
                      className={opcion.id === pregunta.respuestaCorrecta ? 'is-correct' : ''}
                    >
                      <span>{opcion.id.toUpperCase()}</span>
                      {opcion.texto}
                      {opcion.id === pregunta.respuestaCorrecta && <b>Correcta</b>}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        ) : (
          <p className="admin-ai-empty-state">
            {puedeGenerar
              ? 'Genera un borrador para revisar aquí las preguntas y sus respuestas.'
              : 'Selecciona el curso o la semana para generar una evaluación.'}
          </p>
        )}

        <details className="admin-bank-advanced">
          <summary>Opciones avanzadas</summary>
          <label className="admin-json-label">
            Preguntas en formato JSON
            <textarea
              className="admin-code-editor"
              rows={12}
              spellCheck={false}
              value={form.preguntas}
              onChange={evento => setForm({ ...form, preguntas: evento.target.value })}
            />
          </label>
        </details>

        {feedback && (
          <p
            className={feedback.tipo === 'error' ? 'admin-form-error' : 'admin-form-success'}
            role="status"
          >
            {feedback.texto}
          </p>
        )}
        <button disabled={ocupado} className="boton-primario mt-5" type="submit">
          {ocupado ? 'Procesando…' : actual ? 'Guardar cambios' : 'Guardar evaluación'}
        </button>
      </form>
    </div>
  )
}
