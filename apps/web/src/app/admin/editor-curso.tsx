'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { CursoDetalle } from '@/api/catalog'

type Props = { curso: CursoDetalle | null; contenido: unknown[] }

const ejemplo = [
  {
    orden: 1,
    titulo: 'Fundamentos',
    descripcion: 'La primera misión',
    umbral: 70,
    materiales: [
      {
        orden: 1,
        titulo: 'Guía de fundamentos',
        tipo: 'PDF',
        url: 'https://ejemplo.com/guia.pdf',
      },
    ],
    lecciones: [
      {
        orden: 1,
        titulo: 'Hello World',
        duracionMin: 10,
        bloques: [
          {
            orden: 1,
            tipo: 'TEXTO',
            contenido: { markdown: '# Tu primer programa\n\nEscribe tu primer mensaje.' },
          },
          {
            orden: 2,
            tipo: 'CODIGO',
            contenido: { lenguaje: 'python', codigo: 'print("Hello World")' },
          },
        ],
        ejercicios: [],
      },
    ],
  },
]

const rutaDesdeJson = (valor: string): Record<string, unknown>[] => {
  try {
    const parsed = JSON.parse(valor) as unknown
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : []
  } catch {
    return []
  }
}

export const EditorCurso = ({ curso, contenido }: Props): JSX.Element => {
  const router = useRouter()
  const [datos, setDatos] = useState({
    titulo: curso?.titulo ?? '',
    descripcion: curso?.descripcion ?? '',
    tecnologia: curso?.tecnologia ?? 'Python',
    precio: String(curso?.precio ?? 0),
    moneda: curso?.moneda ?? 'USD',
    nivelMin: curso?.nivelMin ?? 'A',
    nivelMax: curso?.nivelMax ?? 'A',
    imagenUrl: curso?.imagenUrl ?? '',
    slug: curso?.slug ?? '',
  })
  const [json, setJson] = useState(JSON.stringify(contenido.length ? contenido : ejemplo, null, 2))
  const [estado, setEstado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const ruta = rutaDesdeJson(json)

  const guardar = async (evento: React.FormEvent): Promise<void> => {
    evento.preventDefault()
    setOcupado(true)
    setError(null)
    setEstado(null)
    try {
      let cursoId = curso?.id
      if (cursoId) {
        const meta = await fetch('/api/admin/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accion: 'actualizar-curso',
            id: cursoId,
            datos: { ...datos, precio: Number(datos.precio), imagenUrl: datos.imagenUrl || null },
          }),
        })
        if (!meta.ok) throw new Error((await meta.json()).error ?? 'No se pudo actualizar el curso')
      } else {
        const creado = await fetch('/api/admin/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accion: 'crear-curso',
            datos: {
              ...datos,
              precio: Number(datos.precio),
              imagenUrl: datos.imagenUrl || undefined,
            },
          }),
        })
        const respuesta = (await creado.json()) as { cursoId?: string; error?: string }
        if (!creado.ok || !respuesta.cursoId)
          throw new Error(respuesta.error ?? 'No se pudo crear el curso')
        cursoId = respuesta.cursoId
      }
      const estructura = JSON.parse(json) as unknown
      if (!Array.isArray(estructura)) throw new Error('El contenido debe ser un arreglo de semanas')
      const guardado = await fetch('/api/admin/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'contenido', id: cursoId, datos: { tomos: estructura } }),
      })
      if (!guardado.ok)
        throw new Error((await guardado.json()).error ?? 'No se pudo guardar el contenido')
      setEstado('Guardado. El contenido queda en borrador hasta que lo publiques.')
      router.push('/admin')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <form onSubmit={guardar} className="admin-editor-grid">
      <section className="tech-admin-card">
        <div className="admin-section-kicker">01 / METADATA</div>
        <h2>{curso ? 'Editar curso' : 'Nuevo curso'}</h2>
        <p className="admin-help">Define la ficha pública y el nivel de entrada.</p>
        <div className="admin-form-grid">
          {(
            [
              ['slug', 'Slug', true],
              ['titulo', 'Título', true],
              ['tecnologia', 'Tecnología', true],
              ['imagenUrl', 'Imagen URL', false],
            ] as const
          ).map(([campo, etiqueta, requerido]) => (
            <label key={campo}>
              {etiqueta}
              <input
                required={requerido}
                value={datos[campo]}
                onChange={e => setDatos({ ...datos, [campo]: e.target.value })}
              />
            </label>
          ))}
          <label className="admin-form-wide">
            Descripción
            <textarea
              required
              value={datos.descripcion}
              onChange={e => setDatos({ ...datos, descripcion: e.target.value })}
              rows={4}
            />
          </label>
          <label>
            Precio
            <input
              type="number"
              min="0"
              step="0.01"
              value={datos.precio}
              onChange={e => setDatos({ ...datos, precio: e.target.value })}
            />
          </label>
          <label>
            Moneda
            <input
              maxLength={3}
              value={datos.moneda}
              onChange={e => setDatos({ ...datos, moneda: e.target.value.toUpperCase() })}
            />
          </label>
          <label>
            Nivel inicial
            <select
              value={datos.nivelMin}
              onChange={e => setDatos({ ...datos, nivelMin: e.target.value })}
            >
              <option>A</option>
              <option>B</option>
              <option>C</option>
              <option>D</option>
              <option>E</option>
              <option>F</option>
            </select>
          </label>
          <label>
            Nivel máximo
            <select
              value={datos.nivelMax}
              onChange={e => setDatos({ ...datos, nivelMax: e.target.value })}
            >
              <option>A</option>
              <option>B</option>
              <option>C</option>
              <option>D</option>
              <option>E</option>
              <option>F</option>
              <option>G</option>
              <option>H</option>
            </select>
          </label>
        </div>
      </section>
      <section className="tech-admin-card">
        <div className="admin-section-kicker">02 / RUTA ACADÉMICA</div>
        <h2>Mapa de la ruta</h2>
        <p className="admin-help">
          Cada semana combina materiales, contenido, repaso y evaluación. El estudiante verá esta
          secuencia como un camino progresivo.
        </p>
        <div className="admin-route-preview" aria-label="Vista previa de la ruta">
          {ruta.length === 0 ? (
            <p className="admin-help">Escribe una estructura válida para ver la ruta.</p>
          ) : (
            ruta.map((semana, index) => {
              const lecciones = Array.isArray(semana.lecciones) ? semana.lecciones : []
              const materiales = Array.isArray(semana.materiales) ? semana.materiales : []
              return (
                <article
                  key={`${String(semana.id ?? index)}-${index}`}
                  className="admin-route-week"
                >
                  <div className="admin-route-week-marker">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div className="admin-route-week-body">
                    <div className="admin-route-week-heading">
                      <div>
                        <span>Semana {index + 1}</span>
                        <h3>{String(semana.titulo ?? 'Semana sin título')}</h3>
                      </div>
                      <span className="admin-route-threshold">
                        Aprueba con {String(semana.umbral ?? 70)}%
                      </span>
                    </div>
                    <div className="admin-route-week-grid">
                      <div>
                        <strong>Materiales</strong>
                        <span>{materiales.length}/4 cargados</span>
                      </div>
                      <div>
                        <strong>Contenido</strong>
                        <span>{lecciones.length} lecciones</span>
                      </div>
                      <div>
                        <strong>Repaso</strong>
                        <span>Banco de preguntas</span>
                      </div>
                      <div>
                        <strong>Evaluación</strong>
                        <span>Test semanal</span>
                      </div>
                    </div>
                    {materiales.length > 0 && (
                      <div className="admin-route-materials">
                        {materiales.slice(0, 4).map((material, materialIndex) => {
                          const item = (material ?? {}) as Record<string, unknown>
                          return (
                            <span key={`${materialIndex}-${String(item.titulo ?? 'material')}`}>
                              {String(item.tipo ?? 'DOCUMENTO')} ·{' '}
                              {String(item.titulo ?? 'Material')}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </article>
              )
            })
          )}
        </div>
        <details className="admin-advanced-editor">
          <summary>Editar estructura avanzada</summary>
          <p className="admin-help">Los bloques admiten TEXTO, CODIGO, VIDEO, IMAGEN y CALLOUT.</p>
          <textarea
            className="admin-code-editor"
            value={json}
            onChange={e => setJson(e.target.value)}
            spellCheck={false}
            rows={26}
            aria-label="Estructura JSON del curso"
          />
          <button
            type="button"
            className="boton-secundario mt-3"
            onClick={() => setJson(JSON.stringify(ejemplo, null, 2))}
          >
            Cargar plantilla de ruta
          </button>
        </details>
      </section>
      {(error || estado) && (
        <p className={error ? 'admin-form-error' : 'admin-form-success'} role="status">
          {error ?? estado}
        </p>
      )}
      <div className="admin-editor-actions">
        <button disabled={ocupado} className="boton-primario" type="submit">
          {ocupado ? 'Guardando…' : 'Guardar curso y contenido'}
        </button>
      </div>
    </form>
  )
}
