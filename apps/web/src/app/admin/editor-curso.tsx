'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { CursoDetalle } from '@/api/catalog'
import type { MazoAdmin } from '@/api/resto'
import { RevisionMazo } from './revision-mazo'
import { RecursosSemanales } from './RecursosSemanales'

type EnfoqueMaterial = 'CONOCIMIENTO_PREVIO' | 'CONTENIDO_SEMANAL' | 'REPASO'

type Material = {
  orden: number
  titulo: string
  descripcion: string | null
  tipo: string
  url: string
  textoExtraido?: string
  enfoques: EnfoqueMaterial[]
}
type Bloque = { orden: number; tipo: string; contenido: Record<string, unknown> }
type Leccion = {
  orden: number
  titulo: string
  duracionMin: number
  bloques: Bloque[]
  ejercicios: unknown[]
}
type Semana = {
  id?: string
  orden: number
  titulo: string
  descripcion: string
  umbral: number
  objetivos: string[]
  materiales: Material[]
  lecciones: Leccion[]
}

type Props = {
  curso: CursoDetalle | null
  contenido: unknown[]
  mazosPorTomo?: { tomoId: string; mazos: MazoAdmin[] }[]
}

const nuevaLeccion = (orden: number): Leccion => ({
  orden,
  titulo: 'Nueva lección',
  duracionMin: 10,
  bloques: [{ orden: 1, tipo: 'TEXTO', contenido: { markdown: '' } }],
  ejercicios: [],
})

const normalizarSemana = (value: unknown, index: number): Semana => {
  const item = (value ?? {}) as Record<string, unknown>
  return {
    ...(typeof item.id === 'string' ? { id: item.id } : {}),
    orden: index + 1,
    titulo: typeof item.titulo === 'string' ? item.titulo : 'Semana ' + (index + 1),
    descripcion: typeof item.descripcion === 'string' ? item.descripcion : '',
    umbral: typeof item.umbral === 'number' ? item.umbral : 70,
    objetivos: Array.isArray(item.objetivos)
      ? item.objetivos.filter((value): value is string => typeof value === 'string')
      : [],
    materiales: Array.isArray(item.materiales)
      ? item.materiales.map((material, materialIndex) => {
          const row = (material ?? {}) as Record<string, unknown>
          const enfoques = Array.isArray(row.enfoques)
            ? row.enfoques.filter(
                (value): value is EnfoqueMaterial =>
                  value === 'CONOCIMIENTO_PREVIO' ||
                  value === 'CONTENIDO_SEMANAL' ||
                  value === 'REPASO',
              )
            : []
          return {
            orden: materialIndex + 1,
            titulo: typeof row.titulo === 'string' ? row.titulo : '',
            descripcion: typeof row.descripcion === 'string' ? row.descripcion : null,
            tipo: typeof row.tipo === 'string' ? row.tipo : 'PDF',
            url: typeof row.url === 'string' ? row.url : '',
            ...(typeof row.textoExtraido === 'string' ? { textoExtraido: row.textoExtraido } : {}),
            enfoques: enfoques.length > 0 ? enfoques : ['CONTENIDO_SEMANAL'],
          }
        })
      : [],
    lecciones: Array.isArray(item.lecciones)
      ? item.lecciones.map((lesson, lessonIndex) => {
          const row = (lesson ?? {}) as Record<string, unknown>
          return {
            orden: lessonIndex + 1,
            titulo: typeof row.titulo === 'string' ? row.titulo : 'Lección ' + (lessonIndex + 1),
            duracionMin: typeof row.duracionMin === 'number' ? row.duracionMin : 10,
            bloques: Array.isArray(row.bloques) ? (row.bloques as Bloque[]) : [],
            ejercicios: Array.isArray(row.ejercicios) ? row.ejercicios : [],
          }
        })
      : [],
  }
}

const semanaVacia = (orden: number): Semana => ({
  orden,
  titulo: 'Semana ' + orden,
  descripcion: '',
  umbral: 70,
  objetivos: [],
  materiales: [],
  lecciones: [nuevaLeccion(1)],
})

export const EditorCurso = ({ curso, contenido, mazosPorTomo = [] }: Props): JSX.Element => {
  const router = useRouter()
  const [datos, setDatos] = useState({
    titulo: curso?.titulo ?? '',
    descripcion: curso?.descripcion ?? '',
    tecnologia: curso?.tecnologia ?? '',
    precio: String(curso?.precio ?? 0),
    moneda: curso?.moneda ?? 'USD',
    nivelMin: curso?.nivelMin ?? 'A',
    nivelMax: curso?.nivelMax ?? 'A',
    imagenUrl: curso?.imagenUrl ?? '',
  })
  const [semanas, setSemanas] = useState<Semana[]>(contenido.map(normalizarSemana))
  const [error, setError] = useState<string | null>(null)
  const [estado, setEstado] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const mazosPorSemana = new Map(mazosPorTomo.map(item => [item.tomoId, item.mazos]))
  const contextoAsistente = [
    curso ? `Curso: ${curso.titulo} (${curso.estado}).` : 'Curso nuevo.',
    ...semanas.map(
      (semana, indice) =>
        `Semana ${indice + 1}: ${semana.titulo}. Materiales: ${
          semana.materiales
            .map(material => material.titulo)
            .filter(Boolean)
            .join(', ') || 'ninguno'
        }. Lecciones: ${
          semana.lecciones
            .map(leccion => leccion.titulo)
            .filter(Boolean)
            .join(', ') || 'ninguna'
        }.`,
    ),
  ]
    .join('\n')
    .slice(0, 1100)

  const cambiarSemana = (indice: number, cambios: Partial<Semana>): void => {
    setSemanas(actual =>
      actual.map((semana, i) => (i === indice ? { ...semana, ...cambios } : semana)),
    )
  }
  const cambiarMaterial = (
    semanaIndex: number,
    materialIndex: number,
    cambios: Partial<Material>,
  ): void => {
    const semana = semanas[semanaIndex]
    cambiarSemana(semanaIndex, {
      materiales: semana.materiales.map((material, i) =>
        i === materialIndex ? { ...material, ...cambios } : material,
      ),
    })
  }
  const cambiarLeccion = (
    semanaIndex: number,
    leccionIndex: number,
    cambios: Partial<Leccion>,
  ): void => {
    const semana = semanas[semanaIndex]
    cambiarSemana(semanaIndex, {
      lecciones: semana.lecciones.map((leccion, i) =>
        i === leccionIndex ? { ...leccion, ...cambios } : leccion,
      ),
    })
  }

  const guardarContenidoSemanal = async (tomosParaGenerarFlashcards: string[] = []): Promise<void> => {
    if (!curso) throw new Error('Guarda el curso antes de generar recursos semanales.')
    const response = await fetch('/api/admin/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'contenido',
        id: curso.id,
        datos: {
          tomos: semanas,
          generarFlashcards: tomosParaGenerarFlashcards.length > 0,
          tomosParaGenerarFlashcards,
        },
      }),
    })
    const result = (await response.json().catch(() => ({}))) as {
      error?: string
      tomos?: { id: string; lecciones: string[] }[]
    }
    if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar el contenido semanal.')
    if (result.tomos?.length)
      setSemanas(actual =>
        actual.map((semana, index) => ({ ...semana, id: result.tomos?.[index]?.id ?? semana.id })),
      )
    if (tomosParaGenerarFlashcards.length > 0) router.refresh()
  }

  const subirArchivo = async (
    archivo: File,
    onUploaded: (data: {
      url: string
      nombre: string
      tipo: string
      textoExtraido?: string
    }) => void,
    llave: string,
  ): Promise<void> => {
    setSubiendo(llave)
    setError(null)
    try {
      const body = new FormData()
      body.set('file', archivo)
      const response = await fetch('/api/admin/media', { method: 'POST', body })
      const result = (await response.json()) as {
        url?: string
        nombre?: string
        tipo?: string
        textoExtraido?: string
        error?: string
      }
      if (!response.ok || !result.url)
        throw new Error(result.error ?? 'No se pudo subir el archivo')
      onUploaded({
        url: result.url,
        nombre: result.nombre ?? archivo.name,
        tipo: result.tipo ?? 'PDF',
        ...(result.textoExtraido ? { textoExtraido: result.textoExtraido } : {}),
      })
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'No se pudo subir el archivo')
    } finally {
      setSubiendo(null)
    }
  }

  const guardar = async (evento: React.FormEvent): Promise<void> => {
    evento.preventDefault()
    const submitter = (evento.nativeEvent as SubmitEvent).submitter
    const generarFlashcards =
      submitter instanceof HTMLButtonElement && submitter.value === 'guardar-y-generar-flashcards'
    setOcupado(true)
    setError(null)
    setEstado(null)
    try {
      let cursoId = curso?.id
      const ficha = {
        ...datos,
        tecnologia: datos.tecnologia.trim() || 'Tecnología',
        precio: Number(datos.precio),
        imagenUrl: datos.imagenUrl || null,
      }
      if (cursoId) {
        const meta = await fetch('/api/admin/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'actualizar-curso', id: cursoId, datos: ficha }),
        })
        const body = (await meta.json().catch(() => ({}))) as { error?: string }
        if (!meta.ok) throw new Error(body.error ?? 'No se pudo actualizar el curso')
      } else {
        const creado = await fetch('/api/admin/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'crear-curso', datos: ficha }),
        })
        const respuesta = (await creado.json()) as { cursoId?: string; error?: string }
        if (!creado.ok || !respuesta.cursoId)
          throw new Error(respuesta.error ?? 'No se pudo crear el curso')
        cursoId = respuesta.cursoId
      }

      const guardado = await fetch('/api/admin/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'contenido',
          id: cursoId,
          datos: { tomos: semanas, generarFlashcards },
        }),
      })
      const result = (await guardado.json().catch(() => ({}))) as { error?: string }
      if (!guardado.ok) throw new Error(result.error ?? 'No se pudo guardar el contenido')
      if (generarFlashcards) {
        setEstado('Curso guardado. La IA está preparando las flashcards; podrás revisarlas aquí.')
        router.refresh()
      } else {
        setEstado('Curso y semanas guardados.')
        router.push('/admin')
        router.refresh()
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el curso')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <form onSubmit={guardar} className="admin-editor-grid">
      <p className="sr-only" data-assistant-context>
        {contextoAsistente}
      </p>
      <section className="tech-admin-card admin-course-details">
        <h1>{curso ? 'Editar curso' : 'Nuevo curso'}</h1>
        <p className="admin-help">Define los datos que verán los estudiantes.</p>
        <div className="admin-form-grid">
          <label className="admin-form-wide">
            Nombre del curso
            <input
              required
              value={datos.titulo}
              onChange={e => setDatos({ ...datos, titulo: e.target.value })}
            />
          </label>
          <label>
            Área temática
            <input
              value={datos.tecnologia}
              onChange={e => setDatos({ ...datos, tecnologia: e.target.value })}
            />
          </label>
          <label>
            Imagen URL
            <input
              value={datos.imagenUrl}
              onChange={e => setDatos({ ...datos, imagenUrl: e.target.value })}
            />
          </label>
          <label className="admin-form-wide">
            Subir imagen
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={subiendo !== null}
              onChange={event => {
                const file = event.target.files?.[0]
                if (file)
                  void subirArchivo(
                    file,
                    result => setDatos(actual => ({ ...actual, imagenUrl: result.url })),
                    'cover',
                  )
                event.currentTarget.value = ''
              }}
            />
            {subiendo === 'cover' && <small>Subiendo imagen…</small>}
          </label>
          <label className="admin-form-wide">
            Descripción
            <textarea
              required
              rows={4}
              value={datos.descripcion}
              onChange={e => setDatos({ ...datos, descripcion: e.target.value })}
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
              {['A', 'B', 'C', 'D', 'E', 'F'].map(nivel => (
                <option key={nivel}>{nivel}</option>
              ))}
            </select>
          </label>
          <label>
            Nivel máximo
            <select
              value={datos.nivelMax}
              onChange={e => setDatos({ ...datos, nivelMax: e.target.value })}
            >
              {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(nivel => (
                <option key={nivel}>{nivel}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="tech-admin-card admin-week-editor">
        <div className="admin-week-editor-heading flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2>Semanas del curso</h2>
            <p className="admin-help">
              Sube PDF y organiza materiales, lecciones, repaso y evaluaciones por semana.
            </p>
          </div>
          <button
            type="button"
            className="boton-secundario"
            onClick={() => setSemanas(actual => [...actual, semanaVacia(actual.length + 1)])}
          >
            Agregar semana
          </button>
        </div>

        <div className="admin-week-list">
          {semanas.map((semana, semanaIndex) => {
            const mazos = semana.id ? (mazosPorSemana.get(semana.id) ?? []) : []
            return (
              <details
                key={semana.id ?? semanaIndex}
                className="admin-week-accordion"
                open={semanaIndex === 0}
              >
                <summary>
                  <span>
                    Semana {semanaIndex + 1}: {semana.titulo || 'Sin título'}
                  </span>
                  <small>
                    {semana.materiales.length} materiales · {semana.lecciones.length} lecciones
                  </small>
                </summary>
                <div className="admin-week-content">
                  <div className="admin-form-grid">
                    <label>
                      Nombre de la semana
                      <input
                        value={semana.titulo}
                        onChange={e => cambiarSemana(semanaIndex, { titulo: e.target.value })}
                        required
                      />
                    </label>
                    <label>
                      Puntaje mínimo (%)
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={semana.umbral}
                        onChange={e =>
                          cambiarSemana(semanaIndex, { umbral: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label className="admin-form-wide">
                      Descripción de la semana
                      <textarea
                        rows={2}
                        value={semana.descripcion}
                        onChange={e => cambiarSemana(semanaIndex, { descripcion: e.target.value })}
                      />
                    </label>
                    <label className="admin-form-wide">
                      Objetivos de aprendizaje (uno por línea)
                      <textarea
                        rows={3}
                        value={semana.objetivos.join('\n')}
                        onChange={e =>
                          cambiarSemana(semanaIndex, {
                            objetivos: e.target.value
                              .split('\n')
                              .map(value => value.trim())
                              .filter(Boolean)
                              .slice(0, 12),
                          })
                        }
                        placeholder="Identifica los conceptos clave de la semana…"
                      />
                    </label>
                  </div>

                  <section className="admin-week-section">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3>Materiales</h3>
                      <button
                        type="button"
                        className="boton-secundario text-xs"
                        onClick={() =>
                          cambiarSemana(semanaIndex, {
                            materiales: [
                              ...semana.materiales,
                              {
                                orden: semana.materiales.length + 1,
                                titulo: '',
                                descripcion: null,
                                tipo: 'PDF',
                                url: '',
                                enfoques: ['CONTENIDO_SEMANAL'],
                              },
                            ],
                          })
                        }
                      >
                        Agregar material
                      </button>
                    </div>
                    {semana.materiales.map((material, materialIndex) => (
                      <div key={materialIndex} className="admin-material-row">
                        <label>
                          Nombre
                          <input
                            required
                            value={material.titulo}
                            onChange={e =>
                              cambiarMaterial(semanaIndex, materialIndex, {
                                titulo: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Tipo
                          <select
                            value={material.tipo}
                            onChange={e =>
                              cambiarMaterial(semanaIndex, materialIndex, { tipo: e.target.value })
                            }
                          >
                            <option>PDF</option>
                            <option>DOCUMENTO</option>
                            <option>VIDEO</option>
                            <option>ENLACE</option>
                          </select>
                        </label>
                        <label className="admin-form-wide">
                          URL del material
                          <input
                            required
                            type="url"
                            value={material.url}
                            onChange={e =>
                              cambiarMaterial(semanaIndex, materialIndex, { url: e.target.value })
                            }
                            placeholder="https://…"
                          />
                        </label>
                        <fieldset className="admin-form-wide admin-material-purposes">
                          <legend>Usar material para</legend>
                          {([
                            ['CONOCIMIENTO_PREVIO', 'Conocimiento previo'],
                            ['CONTENIDO_SEMANAL', 'Contenido semanal'],
                            ['REPASO', 'Repaso'],
                          ] as const).map(([value, label]) => (
                            <label key={value}>
                              <input
                                type="checkbox"
                                checked={material.enfoques.includes(value)}
                                onChange={event =>
                                  cambiarMaterial(semanaIndex, materialIndex, {
                                    enfoques: event.target.checked
                                      ? [...new Set([...material.enfoques, value])]
                                      : material.enfoques.filter(enfoque => enfoque !== value),
                                  })
                                }
                              />
                              {label}
                            </label>
                          ))}
                        </fieldset>
                        <label className="admin-form-wide">
                          Subir PDF
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            disabled={subiendo !== null}
                            onChange={event => {
                              const file = event.target.files?.[0]
                              if (file)
                                void subirArchivo(
                                  file,
                                  result =>
                                    cambiarMaterial(semanaIndex, materialIndex, {
                                      titulo: material.titulo || result.nombre,
                                      tipo: 'PDF',
                                      url: result.url,
                                      textoExtraido: result.textoExtraido,
                                    }),
                                  'pdf-' + semanaIndex + '-' + materialIndex,
                                )
                              event.currentTarget.value = ''
                            }}
                          />
                          {subiendo === 'pdf-' + semanaIndex + '-' + materialIndex && (
                            <small>Subiendo y extrayendo contenido…</small>
                          )}
                        </label>
                        {material.textoExtraido && (
                          <p className="admin-material-extraction">
                            <strong>Contenido extraído</strong>
                            <br />
                            {material.textoExtraido}
                          </p>
                        )}
                        <button
                          type="button"
                          className="admin-text-button"
                          onClick={() =>
                            cambiarSemana(semanaIndex, {
                              materiales: semana.materiales
                                .filter((_, i) => i !== materialIndex)
                                .map((item, i) => ({ ...item, orden: i + 1 })),
                            })
                          }
                        >
                          Quitar material
                        </button>
                      </div>
                    ))}
                    {semana.materiales.length === 0 && (
                      <p className="admin-help">Agrega un enlace o sube un PDF.</p>
                    )}
                  </section>

                  <section className="admin-week-section">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3>Lecciones</h3>
                      <button
                        type="button"
                        className="boton-secundario text-xs"
                        onClick={() =>
                          cambiarSemana(semanaIndex, {
                            lecciones: [
                              ...semana.lecciones,
                              nuevaLeccion(semana.lecciones.length + 1),
                            ],
                          })
                        }
                      >
                        Agregar lección
                      </button>
                    </div>
                    {semana.lecciones.map((leccion, leccionIndex) => {
                      const texto = leccion.bloques.find(bloque => bloque.tipo === 'TEXTO')
                      const markdown =
                        typeof texto?.contenido.markdown === 'string'
                          ? texto.contenido.markdown
                          : ''
                      return (
                        <details key={leccionIndex} className="admin-lesson-accordion">
                          <summary>
                            Lección {leccionIndex + 1}: {leccion.titulo || 'Sin título'}
                          </summary>
                          <div className="admin-form-grid">
                            <label>
                              Nombre de la lección
                              <input
                                value={leccion.titulo}
                                onChange={e =>
                                  cambiarLeccion(semanaIndex, leccionIndex, {
                                    titulo: e.target.value,
                                  })
                                }
                                required
                              />
                            </label>
                            <label>
                              Duración (minutos)
                              <input
                                type="number"
                                min="1"
                                value={leccion.duracionMin}
                                onChange={e =>
                                  cambiarLeccion(semanaIndex, leccionIndex, {
                                    duracionMin: Number(e.target.value),
                                  })
                                }
                              />
                            </label>
                            <label className="admin-form-wide">
                              Contenido
                              <textarea
                                rows={5}
                                value={markdown}
                                onChange={e => {
                                  const bloques = [...leccion.bloques]
                                  const indice = bloques.findIndex(
                                    bloque => bloque.tipo === 'TEXTO',
                                  )
                                  const bloque = {
                                    orden: indice < 0 ? bloques.length + 1 : bloques[indice]!.orden,
                                    tipo: 'TEXTO',
                                    contenido: { markdown: e.target.value },
                                  }
                                  if (indice < 0) bloques.push(bloque)
                                  else bloques[indice] = bloque
                                  cambiarLeccion(semanaIndex, leccionIndex, { bloques })
                                }}
                                placeholder="Escribe la explicación de la lección…"
                              />
                            </label>
                            <button
                              type="button"
                              className="admin-text-button"
                              onClick={() =>
                                cambiarSemana(semanaIndex, {
                                  lecciones: semana.lecciones
                                    .filter((_, i) => i !== leccionIndex)
                                    .map((item, i) => ({ ...item, orden: i + 1 })),
                                })
                              }
                            >
                              Quitar lección
                            </button>
                          </div>
                        </details>
                      )
                    })}
                  </section>

                  <section className="admin-week-section admin-week-review">
                    <div>
                      <h3>Repaso y flashcards</h3>
                      <p className="admin-help">
                        Sube un PDF o usa las lecciones de la semana. La IA extrae conceptos y
                        prepara flashcards para revisión docente.
                      </p>
                    </div>
                    <div className="admin-review-sources">
                      <label className="admin-review-upload">
                        <span>Subir PDF para el repaso</span>
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          disabled={subiendo !== null}
                          onChange={event => {
                            const file = event.target.files?.[0]
                            if (file) {
                              void subirArchivo(
                                file,
                                result =>
                                  cambiarSemana(semanaIndex, {
                                    materiales: [
                                      ...semana.materiales,
                                      {
                                        orden: semana.materiales.length + 1,
                                        titulo: result.nombre,
                                        descripcion: null,
                                        tipo: 'PDF',
                                        url: result.url,
                                        enfoques: ['CONTENIDO_SEMANAL', 'REPASO'],
                                        ...(result.textoExtraido
                                          ? { textoExtraido: result.textoExtraido }
                                          : {}),
                                      },
                                    ],
                                  }),
                                'repaso-' + semanaIndex,
                              )
                            }
                            event.currentTarget.value = ''
                          }}
                        />
                        <small>
                          Se guarda en los materiales de esta semana y alimenta la generación de
                          flashcards.
                        </small>
                        {subiendo === 'repaso-' + semanaIndex && (
                          <small role="status">Subiendo y analizando PDF…</small>
                        )}
                      </label>
                      {semana.materiales.filter(material => material.tipo === 'PDF').length > 0 ? (
                        <div className="admin-review-source-list" aria-label="PDFs para el repaso">
                          {semana.materiales
                            .filter(material => material.tipo === 'PDF')
                            .map((material, indice) => (
                              <article
                                key={material.url || material.titulo || indice}
                                className="admin-review-source-item"
                              >
                                <div className="admin-review-source-heading">
                                  <strong>{material.titulo || 'PDF de la semana'}</strong>
                                  {material.url && (
                                    <a href={material.url} target="_blank" rel="noreferrer">
                                      Abrir PDF
                                    </a>
                                  )}
                                </div>
                                {material.textoExtraido ? (
                                  <details>
                                    <summary>Ver extracción para el repaso</summary>
                                    <p>{material.textoExtraido}</p>
                                  </details>
                                ) : (
                                  <small>
                                    Sin extracción de IA. Sube el archivo desde esta sección para
                                    procesarlo.
                                  </small>
                                )}
                              </article>
                            ))}
                        </div>
                      ) : (
                        <p className="admin-help">Todavía no hay PDFs para el repaso.</p>
                      )}
                    </div>
                    {mazos.length > 0 && (
                      <div className="admin-route-flashcards-list">
                        {mazos.map(mazo => (
                          <details key={mazo.mazoId}>
                            <summary>
                              Versión {mazo.version} · {mazo.estado}
                            </summary>
                            <RevisionMazo mazo={mazo} />
                          </details>
                        ))}
                      </div>
                    )}
                    {mazos.length === 0 && (
                      <p className="admin-help">
                        Aún no hay mazos. Usa “Guardar y generar flashcards” o publica el curso.
                      </p>
                    )}
                  </section>

                  {curso && semana.id ? (
                    <RecursosSemanales
                      courseId={curso.id}
                      tomoId={semana.id}
                      weekTitle={semana.titulo}
                      onPrepare={() => guardarContenidoSemanal()}
                      onRequestFlashcards={() => guardarContenidoSemanal([semana.id as string])}
                    />
                  ) : (
                    <p className="admin-help">Guarda primero el curso y esta semana para iniciar Make.</p>
                  )}

                  <button
                    type="button"
                    className="admin-text-button"
                    onClick={() =>
                      setSemanas(actual =>
                        actual
                          .filter((_, i) => i !== semanaIndex)
                          .map((item, i) => ({ ...item, orden: i + 1 })),
                      )
                    }
                  >
                    Quitar semana
                  </button>
                </div>
              </details>
            )
          })}
          {semanas.length === 0 && (
            <p className="admin-help">Agrega la primera semana del curso.</p>
          )}
        </div>
      </section>

      {(error || estado) && (
        <p className={error ? 'admin-form-error' : 'admin-form-success'} role="status">
          {error ?? estado}
        </p>
      )}
      <div className="admin-editor-actions">
        {curso && (
          <button
            disabled={ocupado || subiendo !== null}
            className="boton-secundario"
            type="submit"
            value="guardar-y-generar-flashcards"
          >
            {ocupado ? 'Procesando…' : 'Guardar y generar flashcards'}
          </button>
        )}
        <button disabled={ocupado || subiendo !== null} className="boton-primario" type="submit">
          {ocupado ? 'Guardando…' : 'Guardar curso'}
        </button>
      </div>
    </form>
  )
}
