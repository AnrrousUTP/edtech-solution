'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { BancoAdmin } from '@/api/catalog'

const plantilla = [
  {
    tipo: 'OPCION_UNICA',
    nivel: 'A',
    enunciado: '¿Qué imprime este programa?',
    opciones: [
      { id: 'a', texto: 'Hello World' },
      { id: 'b', texto: 'Nada' },
    ],
    respuestaCorrecta: 'a',
    puntaje: 1,
  },
]
export const GestorBancos = ({
  bancos,
  tomos,
  cursos,
}: {
  bancos: BancoAdmin[]
  tomos: { id: string; titulo: string }[]
  cursos: { id: string; titulo: string }[]
}): JSX.Element => {
  const router = useRouter()
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const actual = bancos.find(b => b.bancoId === seleccion)
  const [form, setForm] = useState({
    uso: 'DIAGNOSTICO_PREVIO',
    tomoId: '',
    cursoId: '',
    titulo: '',
    preguntas: JSON.stringify(plantilla, null, 2),
  })
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const cargar = (banco: BancoAdmin): void => {
    setSeleccion(banco.bancoId)
    setForm({
      uso: banco.uso,
      tomoId: banco.tomoId ?? '',
      cursoId: banco.cursoId ?? '',
      titulo: banco.titulo,
      preguntas: JSON.stringify(banco.preguntas, null, 2),
    })
  }
  const guardar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setOcupado(true)
    setMensaje(null)
    try {
      const preguntas = JSON.parse(form.preguntas) as unknown
      if (!Array.isArray(preguntas)) throw new Error('Las preguntas deben ser un arreglo JSON')
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
      const data = await respuesta.json()
      if (!respuesta.ok) throw new Error(data.error ?? 'No se pudo guardar')
      setMensaje('Banco guardado')
      setSeleccion(null)
      router.refresh()
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'JSON inválido')
    } finally {
      setOcupado(false)
    }
  }
  return (
    <div className="admin-two-column">
      <section className="tech-admin-card">
        <div className="flex items-center justify-between gap-3">
          <h2>Bancos de preguntas</h2>
          <button
            type="button"
            className="boton-secundario text-xs"
            onClick={() => {
              setSeleccion(null)
              setForm({
                uso: 'DIAGNOSTICO_PREVIO',
                tomoId: '',
                cursoId: '',
                titulo: '',
                preguntas: JSON.stringify(plantilla, null, 2),
              })
            }}
          >
            Nuevo banco
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
        </div>
      </section>
      <form className="tech-admin-card" onSubmit={guardar}>
        <h2>{actual ? 'Editar banco' : 'Crear banco'}</h2>
        <div className="admin-form-grid">
          <label className="admin-form-wide">
            Título
            <input
              required
              value={form.titulo}
              onChange={e => setForm({ ...form, titulo: e.target.value })}
            />
          </label>
          <label>
            Uso
            <select value={form.uso} onChange={e => setForm({ ...form, uso: e.target.value })}>
              <option value="DIAGNOSTICO_PREVIO">Conocimiento previo</option>
              <option value="EVALUACION_INICIAL">Test inicial del curso</option>
              <option value="REFUERZO">Repasa lo aprendido</option>
              <option value="NIVELACION">Nivelación</option>
              <option value="EVALUACION_TOMO">Evaluación semanal</option>
            </select>
          </label>
          <label>
            Semana
            <select
              value={form.tomoId}
              onChange={e => setForm({ ...form, tomoId: e.target.value })}
            >
              <option value="">Global</option>
              {tomos.map(tomo => (
                <option key={tomo.id} value={tomo.id}>
                  {tomo.titulo}
                </option>
              ))}
            </select>
          </label>
          <label>
            Curso
            <select
              value={form.cursoId}
              onChange={e => setForm({ ...form, cursoId: e.target.value })}
            >
              <option value="">Global</option>
              {cursos.map(curso => (
                <option key={curso.id} value={curso.id}>
                  {curso.titulo}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="admin-form-wide admin-json-label">
          Preguntas y respuestas correctas (el docente define respuestaCorrecta)
          <textarea
            className="admin-code-editor"
            rows={20}
            spellCheck={false}
            value={form.preguntas}
            onChange={e => setForm({ ...form, preguntas: e.target.value })}
          />
        </label>
        {mensaje && (
          <p className="admin-form-success" role="status">
            {mensaje}
          </p>
        )}
        <button disabled={ocupado} className="boton-primario mt-5" type="submit">
          {ocupado ? 'Guardando…' : 'Guardar banco'}
        </button>
      </form>
    </div>
  )
}
