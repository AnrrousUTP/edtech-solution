'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { CursoDetalle } from '@/api/catalog'
import type { MazoAdmin } from '@/api/resto'
import { RevisionMazo } from './revision-mazo'
import { RecursosSemanales } from './RecursosSemanales'
import { FlujoRecursosAnimado } from './FlujoRecursosAnimado'

type EnfoqueMaterial = 'CONOCIMIENTO_PREVIO' | 'CONTENIDO_SEMANAL' | 'REPASO'
type TipoEnlace = 'VIDEO' | 'ENLACE'

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

const videoEmbedUrl = (value: string): string | null => {
  try {
    const parsed = new URL(value)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    const segmentos = parsed.pathname.split('/').filter(Boolean)
    let videoId = ''
    if (host === 'youtu.be') videoId = segmentos[0] ?? ''
    else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host))
      videoId = parsed.searchParams.get('v') ?? segmentos[segmentos.length - 1] ?? ''
    if (/^[\w-]{11}$/.test(videoId) && ['youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'youtu.be'].includes(host))
      return `https://www.youtube-nocookie.com/embed/${videoId}`
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const vimeoId = segmentos[segmentos.length - 1] ?? ''
      if (/^\d+$/.test(vimeoId)) return `https://player.vimeo.com/video/${vimeoId}`
    }
    if (host === 'loom.com') {
      const loomId = segmentos[segmentos.length - 1] ?? ''
      if (/^[\w-]+$/.test(loomId)) return `https://www.loom.com/embed/${loomId}`
    }
  } catch {
    return null
  }
  return null
}

const urlExternaSegura = (value: string): string | null => {
  try {
    const parsed = new URL(value)
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.toString() : null
  } catch {
    return null
  }
}

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
  const [panelActivo, setPanelActivo] = useState<'semanas' | 'ficha'>(curso ? 'semanas' : 'ficha')
  const [semanaActiva, setSemanaActiva] = useState(0)
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
  const [enlaceAbierto, setEnlaceAbierto] = useState(false)
  const [errorEnlace, setErrorEnlace] = useState<string | null>(null)
  const [borradorEnlace, setBorradorEnlace] = useState({
    tipo: 'VIDEO' as TipoEnlace,
    titulo: '',
    url: '',
    descripcion: '',
  })
  const mazosPorSemana = new Map(mazosPorTomo.map(item => [item.tomoId, item.mazos]))
  const semanaActual = semanas[semanaActiva] ?? null
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

  const agregarEnlace = (): void => {
    setErrorEnlace(null)
    if (!semanaActual) return
    if (!borradorEnlace.titulo.trim() || !borradorEnlace.url.trim()) {
      setErrorEnlace('Completa el nombre y el enlace del material.')
      return
    }
    let parsed: URL
    try {
      parsed = new URL(borradorEnlace.url.trim())
    } catch {
      setErrorEnlace('Escribe una dirección web válida que comience con https://')
      return
    }
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      setErrorEnlace('El enlace debe usar https:// o http://')
      return
    }
    if (borradorEnlace.tipo === 'VIDEO' && !videoEmbedUrl(parsed.toString())) {
      setErrorEnlace('Usa un enlace de YouTube, Vimeo o Loom. Para otro sitio, selecciona «Enlace web».')
      return
    }
    cambiarSemana(semanaActiva, {
      materiales: [
        ...semanaActual.materiales,
        {
          orden: semanaActual.materiales.length + 1,
          titulo: borradorEnlace.titulo.trim(),
          descripcion: borradorEnlace.descripcion.trim() || null,
          tipo: borradorEnlace.tipo,
          url: parsed.toString(),
          enfoques: ['CONTENIDO_SEMANAL'],
        },
      ],
    })
    setBorradorEnlace({ tipo: 'VIDEO', titulo: '', url: '', descripcion: '' })
    setEnlaceAbierto(false)
  }

  const semanasParaGuardar = (): Semana[] =>
    semanas.map((semana, index) => ({
      ...semana,
      orden: index + 1,
      objetivos: semana.objetivos.map(objetivo => objetivo.trim()).filter(Boolean),
    }))

  const guardarContenidoSemanal = async (tomosParaGenerarFlashcards: string[] = []): Promise<void> => {
    if (!curso) throw new Error('Guarda el curso antes de generar recursos semanales.')
    const response = await fetch('/api/admin/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'contenido',
        id: curso.id,
        datos: {
          tomos: semanasParaGuardar(),
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
    if (!datos.titulo.trim() || !datos.descripcion.trim()) {
      setPanelActivo('ficha')
      setError('Completa el nombre y la descripción del curso antes de guardar.')
      return
    }
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
          datos: { tomos: semanasParaGuardar() },
        }),
      })
      const result = (await guardado.json().catch(() => ({}))) as { error?: string }
      if (!guardado.ok) throw new Error(result.error ?? 'No se pudo guardar el contenido')
      setEstado('Cambios guardados. Puedes seguir editando esta semana.')
      if (!curso && cursoId) router.push(`/admin/cursos/${cursoId}`)
      router.refresh()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el curso')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <form onSubmit={guardar} className="admin-course-workspace">
      <p className="sr-only" data-assistant-context>
        {contextoAsistente}
      </p>

      <header className="admin-course-workspace-header">
        <div className="admin-course-workspace-title">
          <p className="admin-section-eyebrow">ÁREA DOCENTE / CURSOS</p>
          <h1>{curso ? 'Editor del curso' : 'Crear curso'}</h1>
          <p>{curso?.titulo ?? 'Organiza los datos y el contenido semanal del curso.'}</p>
        </div>
        <div className="admin-course-workspace-controls">
          <div className="admin-workspace-tabs" role="group" aria-label="Secciones del curso">
            <button
              type="button"
              aria-pressed={panelActivo === 'semanas'}
              className={panelActivo === 'semanas' ? 'is-active' : ''}
              onClick={() => setPanelActivo('semanas')}
            >
              Semanas <span>{semanas.length}</span>
            </button>
            <button
              type="button"
              aria-pressed={panelActivo === 'ficha'}
              className={panelActivo === 'ficha' ? 'is-active' : ''}
              onClick={() => setPanelActivo('ficha')}
            >
              Datos del curso
            </button>
          </div>
        </div>
      </header>

      {(error || estado) && (
        <p className={error ? 'admin-form-error' : 'admin-form-success'} role="status">
          {error ?? estado}
        </p>
      )}

      {panelActivo === 'ficha' ? (
        <section className="tech-admin-card admin-course-details admin-course-details-panel">
          <div className="admin-panel-heading">
            <div>
              <p className="admin-section-eyebrow">CONFIGURACIÓN</p>
              <h2>Datos del curso</h2>
              <p className="admin-help">Define la información que verán los estudiantes.</p>
            </div>
          </div>
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
      ) : (
        <div className="admin-week-workspace">
          <aside className="admin-week-sidebar" aria-label="Navegación de semanas">
            <div className="admin-week-sidebar-heading">
              <div>
                <p className="admin-section-eyebrow">PLAN DE ESTUDIO</p>
                <h2>Semanas</h2>
                <p>{semanas.length} {semanas.length === 1 ? 'semana' : 'semanas'} en el curso</p>
              </div>
              <button
                type="button"
                className="admin-week-add-icon"
                aria-label="Agregar semana"
                title="Agregar semana"
                onClick={() => {
                  setSemanas(actual => [...actual, semanaVacia(actual.length + 1)])
                  setSemanaActiva(semanas.length)
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
            {semanas.length > 0 ? (
              <nav className="admin-week-nav" aria-label="Semanas del curso">
                {semanas.map((semana, index) => (
                  <button
                    key={semana.id ?? `semana-${index}`}
                    type="button"
                    className={`admin-week-nav-item ${index === semanaActiva ? 'is-active' : ''}`}
                    aria-current={index === semanaActiva ? 'page' : undefined}
                    onClick={() => setSemanaActiva(index)}
                  >
                    <span className="admin-week-nav-number">{String(index + 1).padStart(2, '0')}</span>
                    <span className="admin-week-nav-copy">
                      <strong>{semana.titulo || `Semana ${index + 1}`}</strong>
                      <small>
                        {semana.materiales.length} materiales · {semana.lecciones.length} lecciones
                      </small>
                    </span>
                    <svg className="admin-week-nav-chevron" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                ))}
              </nav>
            ) : (
              <div className="admin-week-sidebar-empty">
                <p>Aún no hay semanas.</p>
                <button
                  type="button"
                  className="boton-secundario"
                  onClick={() => {
                    setSemanas([semanaVacia(1)])
                    setSemanaActiva(0)
                  }}
                >
                  Crear primera semana
                </button>
              </div>
            )}
            <div className="admin-week-sidebar-tip">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0-1.42-1.42M7.06 7.06 5.64 5.64M15 9.5a3 3 0 1 0-5.85 1c.45 1.2 1.85 1.45 1.85 3" />
                <path d="M10.5 16h3M10.8 18h2.4" />
              </svg>
              <p>Prepara objetivos y materiales. La IA crea borradores para que tú los revises.</p>
            </div>
          </aside>

          <div className="admin-week-main">
            {semanaActual ? (
              <>
                <section className="admin-week-canvas" aria-labelledby="active-week-title">
                  <div className="admin-week-canvas-heading">
                    <div className="admin-week-title-fields">
                      <p className="admin-section-eyebrow">
                        SEMANA {String(semanaActiva + 1).padStart(2, '0')}
                      </p>
                      <label htmlFor="active-week-title">Nombre de la semana</label>
                      <input
                        id="active-week-title"
                        className="admin-week-title-input"
                        value={semanaActual.titulo}
                        onChange={e => cambiarSemana(semanaActiva, { titulo: e.target.value })}
                        required
                      />
                    </div>
                    <div className="admin-week-canvas-actions">
                      <div className="admin-week-stat">
                        <strong>{semanaActual.objetivos.filter(objetivo => objetivo.trim()).length}</strong>
                        <span>objetivos</span>
                      </div>
                      <div className="admin-week-stat">
                        <strong>{semanaActual.materiales.length}</strong>
                        <span>materiales</span>
                      </div>
                      <button
                        type="button"
                        className="admin-week-remove"
                        onClick={() => {
                          setSemanas(actual =>
                            actual
                              .filter((_, index) => index !== semanaActiva)
                              .map((item, index) => ({ ...item, orden: index + 1 })),
                          )
                          setSemanaActiva(index => Math.max(0, Math.min(index, semanas.length - 2)))
                        }}
                      >
                        Quitar semana
                      </button>
                    </div>
                  </div>

                  <label className="admin-week-description">
                    Descripción de la semana
                    <textarea
                      rows={2}
                      value={semanaActual.descripcion}
                      onChange={e => cambiarSemana(semanaActiva, { descripcion: e.target.value })}
                      placeholder="Describe brevemente lo que se trabajará esta semana."
                    />
                  </label>

                  <div className="admin-week-setup-grid">
                    <section className="admin-week-panel admin-week-objectives" aria-labelledby="week-objectives-title">
                      <div className="admin-week-panel-heading">
                        <div className="admin-week-panel-title">
                          <span className="admin-week-icon admin-week-icon-blue" aria-hidden="true">
                            <svg viewBox="0 0 24 24"><path d="M5 5.5h14v13H5zM8 9h8M8 12h8M8 15h5" /></svg>
                          </span>
                          <div>
                            <h3 id="week-objectives-title">Objetivos de aprendizaje</h3>
                            <p>¿Qué deberá saber hacer el grupo?</p>
                          </div>
                        </div>
                        <span className="admin-week-count">
                          {semanaActual.objetivos.filter(objetivo => objetivo.trim()).length}
                        </span>
                      </div>
                      {semanaActual.objetivos.length > 0 ? (
                        <ol className="admin-objective-list">
                          {semanaActual.objetivos.map((objetivo, objetivoIndex) => (
                            <li key={`objetivo-${semanaActiva}-${objetivoIndex}`}>
                              <span aria-hidden="true">{objetivoIndex + 1}</span>
                              <input
                                aria-label={`Objetivo de aprendizaje ${objetivoIndex + 1}`}
                                value={objetivo}
                                onChange={event =>
                                  cambiarSemana(semanaActiva, {
                                    objetivos: semanaActual.objetivos.map((item, index) =>
                                      index === objetivoIndex ? event.target.value : item,
                                    ),
                                  })
                                }
                                onBlur={() => {
                                  if (!objetivo.trim())
                                    cambiarSemana(semanaActiva, {
                                      objetivos: semanaActual.objetivos.filter(
                                        (_, index) => index !== objetivoIndex,
                                      ),
                                    })
                                }}
                              />
                              <button
                                type="button"
                                className="admin-icon-button"
                                aria-label={`Quitar objetivo ${objetivoIndex + 1}`}
                                onClick={() =>
                                  cambiarSemana(semanaActiva, {
                                    objetivos: semanaActual.objetivos.filter(
                                      (_, index) => index !== objetivoIndex,
                                    ),
                                  })
                                }
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6m4-6v6M8 7l1 13h6l1-13M9 7V4h6v3" /></svg>
                              </button>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="admin-week-empty-inline">Agrega objetivos para orientar los materiales y las preguntas.</p>
                      )}
                      <button
                        type="button"
                        className="admin-inline-add"
                        onClick={() =>
                          cambiarSemana(semanaActiva, {
                            objetivos: [...semanaActual.objetivos, ''],
                          })
                        }
                      >
                        <span aria-hidden="true">+</span> Agregar objetivo
                      </button>
                    </section>

                    <section className="admin-week-panel admin-week-upload-panel" aria-labelledby="week-upload-title">
                      <div className="admin-week-panel-heading">
                        <div className="admin-week-panel-title">
                          <span className="admin-week-icon admin-week-icon-purple" aria-hidden="true">
                            <svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v4h14v-4" /></svg>
                          </span>
                          <div>
                            <h3 id="week-upload-title">Agregar material</h3>
                            <p>Sube un PDF o agrega un video/enlace. Después eliges para qué se usará.</p>
                          </div>
                        </div>
                      </div>
                      <label className={`admin-week-upload-dropzone ${subiendo === `semana-${semanaActiva}` ? 'is-uploading' : ''}`}>
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          disabled={subiendo !== null}
                          onChange={event => {
                            const file = event.target.files?.[0]
                            if (file)
                              void subirArchivo(
                                file,
                                result => {
                                  const current = semanas[semanaActiva]
                                  if (!current) return
                                  cambiarSemana(semanaActiva, {
                                    materiales: [
                                      ...current.materiales,
                                      {
                                        orden: current.materiales.length + 1,
                                        titulo: result.nombre,
                                        descripcion: null,
                                        tipo: 'PDF',
                                        url: result.url,
                                        enfoques: ['CONTENIDO_SEMANAL'],
                                        ...(result.textoExtraido
                                          ? { textoExtraido: result.textoExtraido }
                                          : {}),
                                      },
                                    ],
                                  })
                                },
                                `semana-${semanaActiva}`,
                              )
                            event.currentTarget.value = ''
                          }}
                        />
                        <span className="admin-upload-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v4h14v-4" /></svg>
                        </span>
                        <strong>
                          {subiendo === `semana-${semanaActiva}`
                            ? 'Subiendo y analizando…'
                            : 'Seleccionar archivo PDF'}
                        </strong>
                        <small>La extracción de texto se mostrará para que la revises.</small>
                      </label>
                    </section>
                  </div>

                  <section className="admin-week-panel admin-week-materials-panel" aria-labelledby="week-materials-title">
                    <div className="admin-week-panel-heading">
                      <div className="admin-week-panel-title">
                        <span className="admin-week-icon admin-week-icon-teal" aria-hidden="true">
                          <svg viewBox="0 0 24 24"><path d="M6 3.5h8l4 4V20H6zM14 3.5V8h4M9 12h6M9 15.5h6" /></svg>
                        </span>
                        <div>
                          <h3 id="week-materials-title">Materiales de la semana</h3>
                          <p>Clasifica cada fuente. Una misma fuente puede usarse en más de una etapa.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="boton-secundario"
                        onClick={() => {
                          setErrorEnlace(null)
                          setEnlaceAbierto(true)
                        }}
                      >
                        Agregar video o enlace
                      </button>
                    </div>

                    {semanaActual.materiales.length > 0 ? (
                      <div className="admin-material-card-list">
                        {semanaActual.materiales.map((material, materialIndex) => (
                          <article key={`${material.url}-${materialIndex}`} className="admin-material-card">
                            <div className="admin-material-card-heading">
                              <span className="admin-material-file-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24"><path d="M6 3.5h8l4 4V20H6zM14 3.5V8h4M9 12h6M9 15.5h6" /></svg>
                              </span>
                              <label className="admin-material-name">
                                Nombre del material
                                <input
                                  required
                                  value={material.titulo}
                                  onChange={e =>
                                    cambiarMaterial(semanaActiva, materialIndex, {
                                      titulo: e.target.value,
                                    })
                                  }
                                  placeholder="Ej. Lectura de introducción"
                                />
                              </label>
                              <label className="admin-material-type">
                                Tipo
                                <select
                                  value={material.tipo}
                                  onChange={e =>
                                    cambiarMaterial(semanaActiva, materialIndex, { tipo: e.target.value })
                                  }
                                >
                                  <option>PDF</option>
                                  <option>DOCUMENTO</option>
                                  <option>VIDEO</option>
                                  <option>ENLACE</option>
                                </select>
                              </label>
                              <button
                                type="button"
                                className="admin-icon-button admin-material-delete"
                                aria-label={`Quitar ${material.titulo || 'material'}`}
                                onClick={() =>
                                  cambiarSemana(semanaActiva, {
                                    materiales: semanaActual.materiales
                                      .filter((_, index) => index !== materialIndex)
                                      .map((item, index) => ({ ...item, orden: index + 1 })),
                                  })
                                }
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6m4-6v6M8 7l1 13h6l1-13M9 7V4h6v3" /></svg>
                              </button>
                            </div>
                            <label className="admin-material-url">
                              Enlace del material
                              <input
                                required
                                type="url"
                                value={material.url}
                                onChange={e =>
                                  cambiarMaterial(semanaActiva, materialIndex, { url: e.target.value })
                                }
                                placeholder="https://…"
                              />
                            </label>
                            {(material.tipo === 'VIDEO' || material.tipo === 'ENLACE') && (
                              <label className="admin-material-url">
                                Notas para incluir en los recursos con IA
                                <textarea
                                  rows={3}
                                  value={material.descripcion ?? ''}
                                  onChange={e =>
                                    cambiarMaterial(semanaActiva, materialIndex, {
                                      descripcion: e.target.value || null,
                                    })
                                  }
                                  placeholder="Añade un resumen o transcripción; la IA no reproduce el video ni navega el sitio por sí sola."
                                />
                                <small>Estas notas se usarán al generar tests y flashcards a partir del enlace.</small>
                              </label>
                            )}
                            {material.url && (
                              <details className="admin-material-preview">
                                <summary>Previsualizar material</summary>
                                {material.tipo === 'PDF' && material.url.startsWith('/api/media/course-media/') ? (
                                  <iframe
                                    title={`Vista previa: ${material.titulo || 'documento PDF'}`}
                                    src={material.url}
                                    loading="lazy"
                                  />
                                ) : material.tipo === 'VIDEO' && videoEmbedUrl(material.url) ? (
                                  <iframe
                                    title={`Video: ${material.titulo || 'material de la semana'}`}
                                    src={videoEmbedUrl(material.url) ?? undefined}
                                    loading="lazy"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    referrerPolicy="strict-origin-when-cross-origin"
                                    allowFullScreen
                                  />
                                ) : urlExternaSegura(material.url) ? (
                                  <div className="admin-material-preview-link">
                                    <span>Este material se abrirá en una pestaña nueva.</span>
                                    <a href={urlExternaSegura(material.url) ?? undefined} target="_blank" rel="noopener noreferrer">
                                      Abrir {material.titulo || 'material'}
                                    </a>
                                  </div>
                                ) : (
                                  <p className="admin-week-empty-inline">No se puede previsualizar esta dirección. Comprueba que sea un enlace web válido.</p>
                                )}
                              </details>
                            )}
                            <fieldset className="admin-material-purposes">
                              <legend>Usar también para</legend>
                              {([
                                ['CONOCIMIENTO_PREVIO', 'Conocimiento previo'],
                                ['CONTENIDO_SEMANAL', 'Contenido semanal'],
                                ['REPASO', 'Repaso'],
                              ] as const).map(([value, label]) => (
                                <label key={value} className={`admin-purpose-chip purpose-${value.toLowerCase()}`}>
                                  <input
                                    type="checkbox"
                                    checked={material.enfoques.includes(value)}
                                    onChange={event =>
                                      cambiarMaterial(semanaActiva, materialIndex, {
                                        enfoques: event.target.checked
                                          ? [...new Set([...material.enfoques, value])]
                                          : material.enfoques.filter(enfoque => enfoque !== value),
                                      })
                                    }
                                  />
                                  <span>{label}</span>
                                </label>
                              ))}
                            </fieldset>
                            {material.textoExtraido && (
                              <details className="admin-material-extraction-details">
                                <summary>Revisar texto extraído por IA</summary>
                                <p>{material.textoExtraido}</p>
                              </details>
                            )}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="admin-week-empty-materials">
                        <span className="admin-empty-document" aria-hidden="true">
                          <svg viewBox="0 0 24 24"><path d="M6 3.5h8l4 4V20H6zM14 3.5V8h4M9 12h6M9 15.5h6" /></svg>
                        </span>
                        <div>
                          <strong>Aún no hay materiales en esta semana</strong>
                          <p>Sube un PDF o agrega un video/enlace; luego marca si sirve para previo, contenido o repaso.</p>
                        </div>
                      </div>
                    )}
                  </section>

                  {curso && semanaActual.id ? (
                    <RecursosSemanales
                      courseId={curso.id}
                      tomoId={semanaActual.id}
                      weekTitle={semanaActual.titulo}
                      objectives={semanaActual.objetivos}
                      materials={semanaActual.materiales.map(({ titulo, tipo }) => ({ titulo, tipo }))}
                      onPrepare={() => guardarContenidoSemanal()}
                      onRequestFlashcards={() => guardarContenidoSemanal([semanaActual.id as string])}
                    />
                  ) : (
                    <section className="admin-week-next-step">
                      <div>
                        <p className="admin-section-eyebrow">SIGUIENTE PASO</p>
                        <h3>Guarda el curso para activar Make + IA</h3>
                        <p>Después podrás generar el test de conocimiento previo, el test de repaso y las flashcards de esta semana.</p>
                      </div>
                    </section>
                  )}

                  <details className="admin-week-collapsible">
                    <summary>
                      <span>Lecciones de esta semana</span>
                      <small>{semanaActual.lecciones.length} {semanaActual.lecciones.length === 1 ? 'lección' : 'lecciones'}</small>
                    </summary>
                    <div className="admin-week-collapsible-content">
                      <div className="admin-week-panel-heading">
                        <div>
                          <h3>Lecciones</h3>
                          <p>Organiza el contenido que verá el grupo durante la semana.</p>
                        </div>
                        <button
                          type="button"
                          className="boton-secundario"
                          onClick={() =>
                            cambiarSemana(semanaActiva, {
                              lecciones: [
                                ...semanaActual.lecciones,
                                nuevaLeccion(semanaActual.lecciones.length + 1),
                              ],
                            })
                          }
                        >
                          Agregar lección
                        </button>
                      </div>
                      {semanaActual.lecciones.map((leccion, leccionIndex) => {
                        const texto = leccion.bloques.find(bloque => bloque.tipo === 'TEXTO')
                        const markdown =
                          typeof texto?.contenido.markdown === 'string' ? texto.contenido.markdown : ''
                        return (
                          <details key={leccionIndex} className="admin-lesson-accordion">
                            <summary>Lección {leccionIndex + 1}: {leccion.titulo || 'Sin título'}</summary>
                            <div className="admin-form-grid">
                              <label>
                                Nombre de la lección
                                <input
                                  value={leccion.titulo}
                                  onChange={e => cambiarLeccion(semanaActiva, leccionIndex, { titulo: e.target.value })}
                                  required
                                />
                              </label>
                              <label>
                                Duración (minutos)
                                <input
                                  type="number"
                                  min="1"
                                  value={leccion.duracionMin}
                                  onChange={e => cambiarLeccion(semanaActiva, leccionIndex, { duracionMin: Number(e.target.value) })}
                                />
                              </label>
                              <label className="admin-form-wide">
                                Contenido
                                <textarea
                                  rows={5}
                                  value={markdown}
                                  onChange={e => {
                                    const bloques = [...leccion.bloques]
                                    const index = bloques.findIndex(bloque => bloque.tipo === 'TEXTO')
                                    const bloque = {
                                      orden: index < 0 ? bloques.length + 1 : bloques[index]!.orden,
                                      tipo: 'TEXTO',
                                      contenido: { markdown: e.target.value },
                                    }
                                    if (index < 0) bloques.push(bloque)
                                    else bloques[index] = bloque
                                    cambiarLeccion(semanaActiva, leccionIndex, { bloques })
                                  }}
                                  placeholder="Escribe la explicación de la lección…"
                                />
                              </label>
                              <button
                                type="button"
                                className="admin-text-button"
                                onClick={() =>
                                  cambiarSemana(semanaActiva, {
                                    lecciones: semanaActual.lecciones
                                      .filter((_, index) => index !== leccionIndex)
                                      .map((item, index) => ({ ...item, orden: index + 1 })),
                                  })
                                }
                              >
                                Quitar lección
                              </button>
                            </div>
                          </details>
                        )
                      })}
                    </div>
                  </details>

                  <details className="admin-week-collapsible">
                    <summary>
                      <span>Repaso y flashcards</span>
                      <small>{mazosPorSemana.get(semanaActual.id ?? '')?.length ?? 0} mazos</small>
                    </summary>
                    <div className="admin-week-collapsible-content">
                      <p className="admin-help">
                        Puedes agregar un PDF adicional para el repaso. La generación de flashcards también usa los materiales marcados para repaso.
                      </p>
                      <label className="admin-week-upload-dropzone admin-week-review-upload">
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          disabled={subiendo !== null}
                          onChange={event => {
                            const file = event.target.files?.[0]
                            if (file)
                              void subirArchivo(
                                file,
                                result => {
                                  const current = semanas[semanaActiva]
                                  if (!current) return
                                  cambiarSemana(semanaActiva, {
                                    materiales: [
                                      ...current.materiales,
                                      {
                                        orden: current.materiales.length + 1,
                                        titulo: result.nombre,
                                        descripcion: null,
                                        tipo: 'PDF',
                                        url: result.url,
                                        enfoques: ['REPASO'],
                                        ...(result.textoExtraido ? { textoExtraido: result.textoExtraido } : {}),
                                      },
                                    ],
                                  })
                                },
                                `repaso-${semanaActiva}`,
                              )
                            event.currentTarget.value = ''
                          }}
                        />
                        <strong>Subir PDF para el repaso</strong>
                        <small>El archivo quedará clasificado para el repaso de esta semana.</small>
                      </label>
                      {semanaActual.materiales.filter(material => material.tipo === 'PDF').length > 0 ? (
                        <div className="admin-review-source-list" aria-label="PDFs de la semana">
                          {semanaActual.materiales
                            .filter(material => material.tipo === 'PDF')
                            .map((material, index) => (
                              <article key={material.url || material.titulo || index} className="admin-review-source-item">
                                <div className="admin-review-source-heading">
                                  <strong>{material.titulo || 'PDF de la semana'}</strong>
                                  {material.url && <a href={material.url} target="_blank" rel="noreferrer">Abrir PDF</a>}
                                </div>
                                {material.textoExtraido ? (
                                  <details>
                                    <summary>Ver texto extraído</summary>
                                    <p>{material.textoExtraido}</p>
                                  </details>
                                ) : <small>El PDF aún no tiene texto extraído.</small>}
                              </article>
                            ))}
                        </div>
                      ) : (
                        <p className="admin-week-empty-inline">Todavía no hay PDFs para el repaso.</p>
                      )}
                      {(mazosPorSemana.get(semanaActual.id ?? '') ?? []).length > 0 ? (
                        <div className="admin-route-flashcards-list">
                          {(mazosPorSemana.get(semanaActual.id ?? '') ?? []).map(mazo => (
                            <details key={mazo.mazoId}>
                              <summary>Versión {mazo.version} · {mazo.estado}</summary>
                              <RevisionMazo mazo={mazo} />
                            </details>
                          ))}
                        </div>
                      ) : (
                        <p className="admin-week-empty-inline">Las flashcards aparecerán aquí después de aprobar los borradores.</p>
                      )}
                    </div>
                  </details>
                </section>
              </>
            ) : (
              <section className="admin-week-empty-state">
                <span className="admin-week-empty-state-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></svg>
                </span>
                <p className="admin-section-eyebrow">CONTENIDO SEMANAL</p>
                <h2>Empieza por crear una semana</h2>
                <p>Define objetivos, agrega los materiales y prepara los recursos para revisar.</p>
                <button
                  type="button"
                  className="boton-primario"
                  onClick={() => {
                    setSemanas([semanaVacia(1)])
                    setSemanaActiva(0)
                  }}
                >
                  Crear primera semana
                </button>
              </section>
            )}
          </div>
        </div>
      )}

      {enlaceAbierto && (
        <div className="admin-link-dialog-backdrop">
          <section className="admin-link-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-link-dialog-title">
            <div className="admin-link-dialog-heading">
              <div>
                <p className="admin-section-eyebrow">FUENTE EXTERNA · SEMANA {semanaActiva + 1}</p>
                <h2 id="admin-link-dialog-title">Agregar video o enlace</h2>
                <p>Los videos se pueden reproducir aquí. Para que la IA los use, añade notas o una transcripción.</p>
              </div>
              <button type="button" className="admin-icon-button" onClick={() => setEnlaceAbierto(false)} aria-label="Cerrar formulario">×</button>
            </div>
            <div className="admin-link-dialog-grid">
              <label>
                Tipo de material
                <select
                  value={borradorEnlace.tipo}
                  onChange={event => setBorradorEnlace(current => ({ ...current, tipo: event.target.value as TipoEnlace }))}
                >
                  <option value="VIDEO">Video de YouTube, Vimeo o Loom</option>
                  <option value="ENLACE">Enlace web</option>
                </select>
              </label>
              <label>
                Nombre del material
                <input
                  value={borradorEnlace.titulo}
                  onChange={event => setBorradorEnlace(current => ({ ...current, titulo: event.target.value }))}
                  placeholder="Ej. Introducción a las etiquetas HTML"
                />
              </label>
              <label className="admin-link-dialog-wide">
                URL del video o página
                <input
                  type="url"
                  value={borradorEnlace.url}
                  onChange={event => setBorradorEnlace(current => ({ ...current, url: event.target.value }))}
                  placeholder={borradorEnlace.tipo === 'VIDEO' ? 'https://youtu.be/…' : 'https://…'}
                />
              </label>
              <label className="admin-link-dialog-wide">
                Resumen, apuntes o transcripción para la IA <span>(opcional)</span>
                <textarea
                  rows={4}
                  value={borradorEnlace.descripcion}
                  onChange={event => setBorradorEnlace(current => ({ ...current, descripcion: event.target.value }))}
                  placeholder="Escribe ideas clave del material; se usarán para preparar los tests y flashcards."
                />
              </label>
            </div>
            {errorEnlace && <p className="admin-form-error" role="alert">{errorEnlace}</p>}
            <div className="admin-link-dialog-actions">
              <button type="button" className="boton-secundario" onClick={() => setEnlaceAbierto(false)}>Cancelar</button>
              <button type="button" className="boton-primario" onClick={agregarEnlace}>Agregar a la semana</button>
            </div>
          </section>
        </div>
      )}

      <div className="admin-editor-actions">
        <button disabled={ocupado || subiendo !== null} className="boton-primario" type="submit">
          {ocupado ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}
