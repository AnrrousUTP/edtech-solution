'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import type { CarreraResumen } from '@/api/catalog'

export const GestorCarreras = ({
  carreras,
  cursos,
}: {
  carreras: CarreraResumen[]
  cursos: {
    id: string
    titulo: string
    tecnologia: string
    nivelMin: string
    nivelMax: string
    estado: string
  }[]
}): JSX.Element => {
  const router = useRouter()
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const actual = carreras.find(c => c.id === seleccion)
  const [form, setForm] = useState({
    slug: '',
    titulo: '',
    descripcion: '',
    imagenUrl: '',
    publicar: false,
    cursos: [] as string[],
  })
  const cargar = (carrera: CarreraResumen): void => {
    setSeleccion(carrera.id)
    setForm({
      slug: carrera.slug,
      titulo: carrera.titulo,
      descripcion: carrera.descripcion,
      imagenUrl: carrera.imagenUrl ?? '',
      publicar: carrera.estado === 'PUBLICADO',
      cursos: [...carrera.cursos].sort((a, b) => a.orden - b.orden).map(c => c.cursoId),
    })
  }
  const moverCurso = (cursoId: string, direccion: -1 | 1): void => {
    setForm(actualForm => {
      const indice = actualForm.cursos.indexOf(cursoId)
      const destino = indice + direccion
      if (indice < 0 || destino < 0 || destino >= actualForm.cursos.length) return actualForm
      const cursosOrdenados = [...actualForm.cursos]
      ;[cursosOrdenados[indice], cursosOrdenados[destino]] = [
        cursosOrdenados[destino],
        cursosOrdenados[indice],
      ]
      return { ...actualForm, cursos: cursosOrdenados }
    })
  }
  const guardar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setOcupado(true)
    setMensaje(null)
    const accion = actual ? 'actualizar-carrera' : 'crear-carrera'
    const respuesta = await fetch('/api/admin/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion,
        ...(actual ? { id: actual.id } : {}),
        datos: {
          ...form,
          cursos: form.cursos.map((cursoId, orden) => ({ cursoId, orden: orden + 1 })),
        },
      }),
    })
    const data = await respuesta.json()
    setOcupado(false)
    if (!respuesta.ok) {
      setMensaje(data.error ?? 'No se pudo guardar')
      return
    }
    setMensaje('Ruta guardada')
    setSeleccion(null)
    setForm({ slug: '', titulo: '', descripcion: '', imagenUrl: '', publicar: false, cursos: [] })
    router.refresh()
  }
  return (
    <div className="admin-two-column">
      <section className="tech-admin-card">
        <div className="flex items-center justify-between gap-3">
          <h2>Rutas de aprendizaje</h2>
          <button
            className="boton-secundario text-xs"
            type="button"
            onClick={() => {
              setSeleccion(null)
              setForm({
                slug: '',
                titulo: '',
                descripcion: '',
                imagenUrl: '',
                publicar: false,
                cursos: [],
              })
            }}
          >
            Nueva ruta
          </button>
        </div>
        <div className="mt-5 space-y-2">
          {carreras.map(carrera => (
            <button
              key={carrera.id}
              type="button"
              onClick={() => cargar(carrera)}
              className={`admin-list-row ${seleccion === carrera.id ? 'is-selected' : ''}`}
            >
              <span>
                <strong>{carrera.titulo}</strong>
                <small>
                  {carrera.slug} · {carrera.cursos.length} cursos
                </small>
              </span>
              <span className="admin-status">{carrera.estado}</span>
            </button>
          ))}
          {!carreras.length && <p className="admin-help">Aún no hay rutas publicadas.</p>}
        </div>
      </section>
      <form className="tech-admin-card" onSubmit={guardar}>
        <h2>{actual ? 'Editar ruta' : 'Crear ruta'}</h2>
        <div className="admin-form-grid">
          <label>
            Slug
            <input
              required
              value={form.slug}
              onChange={e => setForm({ ...form, slug: e.target.value })}
            />
          </label>
          <label>
            Título
            <input
              required
              value={form.titulo}
              onChange={e => setForm({ ...form, titulo: e.target.value })}
            />
          </label>
          <label className="admin-form-wide">
            Descripción
            <textarea
              required
              rows={4}
              value={form.descripcion}
              onChange={e => setForm({ ...form, descripcion: e.target.value })}
            />
          </label>
          <label className="admin-form-wide">
            Imagen URL
            <input
              value={form.imagenUrl}
              onChange={e => setForm({ ...form, imagenUrl: e.target.value })}
            />
          </label>
        </div>
        <fieldset className="admin-course-picker admin-route-sequence">
          <legend>Orden de la ruta</legend>
          <p className="admin-help">Define la secuencia que seguirá el estudiante.</p>
          {form.cursos.length ? (
            form.cursos.map((cursoId, indice) => {
              const curso = cursos.find(item => item.id === cursoId)
              if (!curso) return null
              return (
                <div key={curso.id} className="admin-route-course-row">
                  <GripVertical aria-hidden="true" className="admin-route-course-grip" />
                  <span className="admin-route-course-order">{indice + 1}</span>
                  <span className="admin-route-course-copy">
                    <strong>{curso.titulo}</strong>
                    <small>
                      {curso.tecnologia} · Nivel {curso.nivelMin}–{curso.nivelMax} · {curso.estado}
                    </small>
                  </span>
                  <span className="admin-route-course-actions">
                    <button
                      type="button"
                      className="admin-icon-button"
                      onClick={() => moverCurso(curso.id, -1)}
                      disabled={indice === 0}
                      aria-label={`Subir ${curso.titulo}`}
                    >
                      <ArrowUp aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="admin-icon-button"
                      onClick={() => moverCurso(curso.id, 1)}
                      disabled={indice === form.cursos.length - 1}
                      aria-label={`Bajar ${curso.titulo}`}
                    >
                      <ArrowDown aria-hidden="true" />
                    </button>
                  </span>
                </div>
              )
            })
          ) : (
            <p className="admin-help">Selecciona cursos para construir el recorrido.</p>
          )}
        </fieldset>
        <fieldset className="admin-course-picker">
          <legend>Cursos disponibles</legend>
          {cursos.map(curso => (
            <label key={curso.id}>
              <input
                type="checkbox"
                checked={form.cursos.includes(curso.id)}
                onChange={e =>
                  setForm({
                    ...form,
                    cursos: e.target.checked
                      ? [...form.cursos, curso.id]
                      : form.cursos.filter(id => id !== curso.id),
                  })
                }
              />
              <span>
                <strong>{curso.titulo}</strong>
                <small>
                  {curso.tecnologia} · Nivel {curso.nivelMin}–{curso.nivelMax} · {curso.estado}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="admin-checkbox">
          <input
            type="checkbox"
            checked={form.publicar}
            onChange={e => setForm({ ...form, publicar: e.target.checked })}
          />{' '}
          Publicar ruta
        </label>
        {mensaje && (
          <p className="admin-form-success" role="status">
            {mensaje}
          </p>
        )}
        <button disabled={ocupado} className="boton-primario mt-5" type="submit">
          {ocupado ? 'Guardando…' : 'Guardar ruta'}
        </button>
      </form>
    </div>
  )
}
