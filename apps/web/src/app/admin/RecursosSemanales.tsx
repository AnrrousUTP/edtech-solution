'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { MazoAdmin } from '@/api/resto'
import type { PreguntaEvaluacionBorrador } from '@/lib/assistant/bedrock'

type Job = {
  jobId: string
  status: 'QUEUED' | 'PROCESSING' | 'READY' | 'APPROVING' | 'APPROVED' | 'FAILED'
  retryable?: boolean
  error?: string
  priorQuestions?: PreguntaEvaluacionBorrador[]
  reviewQuestions?: PreguntaEvaluacionBorrador[]
}

const esperar = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
type EstadoFlashcards = 'IDLE' | 'PROCESSING' | 'READY' | 'FAILED' | 'TIMEOUT'

export const RecursosSemanales = ({
  courseId,
  tomoId,
  weekTitle,
  onPrepare,
  onRequestFlashcards,
}: {
  courseId: string
  tomoId: string
  weekTitle: string
  onPrepare: () => Promise<void>
  onRequestFlashcards: () => Promise<void>
}): JSX.Element => {
  const router = useRouter()
  const [job, setJob] = useState<Job | null>(null)
  const [busy, setBusy] = useState(false)
  const [restoring, setRestoring] = useState(true)
  const [flashcardsStatus, setFlashcardsStatus] = useState<EstadoFlashcards>('IDLE')
  const [message, setMessage] = useState<string | null>(null)
  const [showFlow, setShowFlow] = useState(false)
  const [flowRun, setFlowRun] = useState(0)

  useEffect(() => {
    let active = true
    const restore = async (): Promise<void> => {
      setRestoring(true)
      try {
        const response = await fetch(
          `/api/admin/weekly-resources?courseId=${encodeURIComponent(courseId)}&tomoId=${encodeURIComponent(tomoId)}`,
          { cache: 'no-store' },
        )
        if (!response.ok) return
        const recovered = (await response.json()) as Job | { job: null }
        if (!active) return
        if ('job' in recovered) setJob(null)
        else setJob(recovered)
      } catch {
        // La carga del editor sigue disponible aunque no se pueda restaurar el borrador.
      } finally {
        if (active) setRestoring(false)
      }
    }
    void restore()
    return () => {
      active = false
    }
  }, [courseId, tomoId])

  const consultarTrabajo = async (jobId: string): Promise<Job['status']> => {
    let lastStatus: Job['status'] = 'QUEUED'
    for (let intent = 0; intent < 80; intent += 1) {
      await esperar(2500)
      const statusResponse = await fetch(`/api/admin/weekly-resources/${jobId}`, {
        cache: 'no-store',
      })
      const status = (await statusResponse.json().catch(() => ({}))) as Job & { error?: string }
      if (!statusResponse.ok) throw new Error(status.error ?? 'Se perdió el estado del proceso.')
      lastStatus = status.status
      setJob({ ...status, jobId })
      if (status.status === 'READY' || status.status === 'FAILED' || status.status === 'APPROVED')
        return status.status
    }
    return lastStatus
  }

  const iniciar = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    setJob(null)
    setFlashcardsStatus('IDLE')
    try {
      await onPrepare()
      const response = await fetch('/api/admin/weekly-resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, tomoId }),
      })
      const body = (await response.json().catch(() => ({}))) as { jobId?: string; error?: string }
      if (!response.ok || !body.jobId)
        throw new Error(body.error ?? 'No se pudo iniciar la automatización.')
      const current: Job = { jobId: body.jobId, status: 'QUEUED' }
      setJob(current)
      const status = await consultarTrabajo(body.jobId)
      if (status === 'QUEUED' || status === 'PROCESSING' || status === 'APPROVING')
        setMessage(
          'El trabajo sigue activo. Puedes consultar su estado sin crear otro proceso.',
        )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo iniciar la automatización.')
    } finally {
      setBusy(false)
    }
  }

  const reconsultarTrabajo = async (): Promise<void> => {
    if (!job) return
    setBusy(true)
    setMessage(null)
    try {
      const status = await consultarTrabajo(job.jobId)
      if (status === 'QUEUED' || status === 'PROCESSING' || status === 'APPROVING')
        setMessage('El trabajo sigue activo. Vuelve a consultar en un momento.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo consultar el trabajo.')
    } finally {
      setBusy(false)
    }
  }

  const reintentarEnMake = async (): Promise<void> => {
    if (!job) return
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/weekly-resources/${job.jobId}/retry`, {
        method: 'POST',
      })
      const body = (await response.json().catch(() => ({}))) as {
        error?: string
        status?: Job['status']
      }
      if (!response.ok) throw new Error(body.error ?? 'No se pudo reenviar el trabajo a Make.')
      setJob({ ...job, status: body.status ?? job.status, retryable: false })
      const status = await consultarTrabajo(job.jobId)
      if (status === 'QUEUED' || status === 'PROCESSING' || status === 'APPROVING')
        setMessage('Make recibió el reintento. El proceso sigue activo; puedes consultar su estado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo reenviar el trabajo a Make.')
    } finally {
      setBusy(false)
    }
  }

  const aprobar = async (): Promise<void> => {
    if (!job) return
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/weekly-resources/${job.jobId}/approve`, {
        method: 'POST',
      })
      const body = (await response.json().catch(() => ({}))) as {
        alreadyApproved?: boolean
        error?: string
        status?: Job['status']
      }
      if (!response.ok) throw new Error(body.error ?? 'No se pudieron aprobar los borradores.')
      setJob({ ...job, status: body.status ?? 'APPROVED' })
      if (body.alreadyApproved) {
        setMessage('Los borradores ya estaban aprobados. Puedes solicitar las flashcards de esta semana.')
        return
      }
      setMessage('Borradores aprobados. Solicitando flashcards de esta semana…')
      await solicitarFlashcards()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se completó la aprobación.')
    } finally {
      setBusy(false)
    }
  }

  const solicitarFlashcards = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      const before = await fetch(`/api/admin/flashcards/tomos/${tomoId}`, { cache: 'no-store' })
        .then(async response => (response.ok ? ((await response.json()) as MazoAdmin[]) : []))
        .catch(() => [])
      setFlashcardsStatus('PROCESSING')
      await onRequestFlashcards()
      setMessage('Flashcards solicitadas. Aparecerán aquí cuando termine su preparación.')
      void vigilarFlashcards(before)
    } catch (error) {
      setFlashcardsStatus('FAILED')
      setMessage(
        error instanceof Error ? error.message : 'No se pudieron solicitar las flashcards.',
      )
    } finally {
      setBusy(false)
    }
  }

  const vigilarFlashcards = async (before: MazoAdmin[]): Promise<void> => {
    const versions = new Map(
      before.map(mazo => [
        mazo.mazoId,
        { version: mazo.version, estado: mazo.estado, hash: mazo.contenidoHash },
      ]),
    )
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await esperar(5000)
      let mazos: MazoAdmin[]
      try {
        const response = await fetch(`/api/admin/flashcards/tomos/${tomoId}`, { cache: 'no-store' })
        if (!response.ok) continue
        mazos = (await response.json().catch(() => [])) as MazoAdmin[]
      } catch {
        continue
      }
      const changed = mazos.filter(mazo => {
        const old = versions.get(mazo.mazoId)
        return (
          !old ||
          old.version !== mazo.version ||
          old.estado !== mazo.estado ||
          old.hash !== mazo.contenidoHash
        )
      })
      if (changed.some(mazo => mazo.estado === 'FALLIDO')) {
        setFlashcardsStatus('FAILED')
        setMessage('La preparación de flashcards falló. Puedes volver a solicitarla.')
        return
      }
      if (changed.some(mazo => mazo.estado === 'EN_REVISION' || mazo.estado === 'PUBLICADO')) {
        setFlashcardsStatus('READY')
        setMessage('Flashcards listas. Ya aparecen en la lista para revisar y aprobar.')
        router.refresh()
        return
      }
    }
    setFlashcardsStatus('TIMEOUT')
    setMessage('La preparación sigue pendiente. Recarga el panel para consultar de nuevo.')
  }

  const renderQuestions = (
    title: string,
    questions?: PreguntaEvaluacionBorrador[],
  ): JSX.Element | null =>
    questions ? (
      <section className="weekly-output-question" aria-label={title}>
        <div className="weekly-output-question-heading">
          <h4>{title}</h4>
          <span>Borrador</span>
        </div>
        <ol>
          {questions.map((question, index) => (
            <li key={`${title}-${index}`}>
              <strong>{question.enunciado}</strong>
              <ul>
                {question.opciones.map(option => (
                  <li key={option.id}>
                    {option.texto}
                    {option.id === question.respuestaCorrecta ? ' · Respuesta correcta' : ''}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
    ) : null

  return (
    <section
      className="admin-week-section admin-weekly-automation"
      aria-labelledby={`weekly-ai-${tomoId}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id={`weekly-ai-${tomoId}`}>Automatización de recursos · {weekTitle}</h3>
          <p className="admin-help">
            Reúne objetivos y materiales, envíalos a Make y deja que la IA prepare recursos para tu revisión.
          </p>
        </div>
        <div className="weekly-flow-actions">
          {!showFlow ? (
            <button className="boton-secundario weekly-flow-toggle" type="button" onClick={() => setShowFlow(true)}>
              Ver animación del flujo
            </button>
          ) : (
            <>
              <button
                className="boton-secundario weekly-flow-toggle"
                type="button"
                onClick={() => setFlowRun(value => value + 1)}
              >
                Reproducir de nuevo
              </button>
              <button className="boton-secundario weekly-flow-toggle" type="button" onClick={() => setShowFlow(false)}>
                Ocultar
              </button>
            </>
          )}
        </div>
      </div>

      {showFlow && (
        <div
          className="weekly-flow-demo"
          aria-label="Flujo de automatización, del contenido semanal a los recursos para revisión"
        >
          <ol key={flowRun}>
            <li>
              <span className="weekly-flow-step-number">01</span>
              <span className="weekly-flow-step-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 5h14v14H5zM8 9h8M8 12h8M8 15h5" /></svg></span>
              <strong>Objetivos</strong>
              <small>Defines qué debe aprender el grupo.</small>
            </li>
            <li>
              <span className="weekly-flow-step-number">02</span>
              <span className="weekly-flow-step-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3.5h8l4 4V20H6zM14 3.5V8h4M9 12h6M9 15.5h6" /></svg></span>
              <strong>Materiales</strong>
              <small>Seleccionas fuentes para previo, contenido y repaso.</small>
            </li>
            <li>
              <span className="weekly-flow-step-number">03</span>
              <span className="weekly-flow-step-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16M7 4v6m10-6v6M6 13h4m4 0h4M6 17h4m4 0h4" /></svg></span>
              <strong>Make</strong>
              <small>Recibe la solicitud y coordina el proceso automatizado.</small>
            </li>
            <li>
              <span className="weekly-flow-step-number">04</span>
              <span className="weekly-flow-step-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.36-6.36-2.12 2.12M7.76 16.24l-2.12 2.12m12.72 0-2.12-2.12M7.76 7.76 5.64 5.64M10 14l4-4m-3.5 6h3" /></svg></span>
              <strong>IA analiza</strong>
              <small>Lee documentos y extrae conceptos relacionados con tus objetivos.</small>
            </li>
            <li>
              <span className="weekly-flow-step-number">05</span>
              <span className="weekly-flow-step-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h1m3 0h4M8 12h1m3 0h4M8 16h1m3 0h4" /></svg></span>
              <strong>Tests listos</strong>
              <small>Quedan dos borradores: conocimiento previo y repaso.</small>
            </li>
            <li>
              <span className="weekly-flow-step-number">06</span>
              <span className="weekly-flow-step-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m7 7 10-2 2 12-10 2zM5 9l-2 1 2 11 10-2M9 10l5-1m-5 5 5-1" /></svg></span>
              <strong>Flashcards</strong>
              <small>Después de aprobar, preparas tarjetas para revisar.</small>
            </li>
          </ol>
        </div>
      )}

      {!job && !restoring && (
        <div className="weekly-output-preview" aria-label="Recursos que se prepararán para esta semana">
          <article className="weekly-output-preview-card weekly-output-preview-blue">
            <div><span className="weekly-output-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h1m3 0h4M8 12h1m3 0h4M8 16h1m3 0h4" /></svg></span><span className="weekly-output-state">Pendiente de generar</span></div>
            <h4>Test de conocimiento previo</h4>
            <p>Diagnóstico inicial basado en los objetivos y materiales que marques para previo.</p>
          </article>
          <article className="weekly-output-preview-card weekly-output-preview-purple">
            <div><span className="weekly-output-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h1m3 0h4M8 12h1m3 0h4M8 16h1m3 0h4" /></svg></span><span className="weekly-output-state">Pendiente de generar</span></div>
            <h4>Test de repaso</h4>
            <p>Preguntas de práctica creadas a partir del contenido semanal seleccionado.</p>
          </article>
          <article className="weekly-output-preview-card weekly-output-preview-green">
            <div><span className="weekly-output-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m7 7 10-2 2 12-10 2zM5 9l-2 1 2 11 10-2M9 10l5-1m-5 5 5-1" /></svg></span><span className="weekly-output-state">Para revisión docente</span></div>
            <h4>Flashcards</h4>
            <p>Tarjetas para estudiar y repasar, disponibles después de aprobar los borradores.</p>
          </article>
        </div>
      )}

      <button
        type="button"
        className="boton-primario mt-3"
        disabled={
          busy ||
          restoring ||
          job?.status === 'QUEUED' ||
          job?.status === 'PROCESSING' ||
          job?.status === 'APPROVING'
        }
        onClick={() => void iniciar()}
      >
        {busy
          ? 'Preparando recursos…'
          : restoring
            ? 'Recuperando trabajo guardado…'
            : 'Guardar y generar recursos con Make + IA'}
      </button>

      {restoring && (
        <p className="admin-help" role="status">
          Consultando si ya existe un borrador para esta semana…
        </p>
      )}

      {(job?.status === 'QUEUED' ||
        job?.status === 'PROCESSING' ||
        job?.status === 'APPROVING') &&
        !busy && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="boton-secundario"
            onClick={() => void reconsultarTrabajo()}
          >
            Volver a consultar estado
          </button>
          {job.retryable && (
            <button
              type="button"
              className="boton-secundario"
              onClick={() => void reintentarEnMake()}
            >
              {job.status === 'PROCESSING' ? 'Reanudar análisis con Make' : 'Reenviar trabajo a Make'}
            </button>
          )}
        </div>
      )}

      {busy && job?.status !== 'APPROVED' && (
        <div className="weekly-ai-progress" role="status" aria-live="polite">
          <span className="weekly-ai-orbit" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <strong>
              {job?.status === 'PROCESSING'
                ? 'La IA está analizando los materiales'
                : job?.status === 'APPROVING' || job?.status === 'READY'
                  ? 'Guardando los bancos aprobados'
                  : 'Make está enrutando el trabajo'}
            </strong>
            <p>
              {job?.status === 'PROCESSING'
                ? 'Extrayendo conceptos y preparando preguntas de previo y repaso.'
                : job?.status === 'APPROVING' || job?.status === 'READY'
                  ? 'Guardando el test previo y el test de repaso para el curso.'
                  : 'El servidor recibe el identificador y solicita los borradores.'}
            </p>
          </div>
        </div>
      )}

      {job?.status === 'APPROVING' && !busy && (
        <div className="weekly-ai-progress" role="status" aria-live="polite">
          <span className="weekly-ai-orbit" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <strong>Guardando los bancos aprobados</strong>
            <p>Si la conexión se interrumpió, puedes reanudar la aprobación desde este borrador.</p>
          </div>
        </div>
      )}

      {(job?.status === 'READY' || job?.status === 'APPROVING') && (
        <div className="mt-4 space-y-4">
          {job.error && (
            <p className="admin-form-error" role="alert">
              {job.error}
            </p>
          )}
          <p className="admin-form-success" role="status">
            Borradores listos para revisión. La nota del test previo es diagnóstica y no bloquea por
            puntaje.
          </p>
          {renderQuestions('Test de conocimiento previo', job.priorQuestions)}
          {renderQuestions('Test de repaso', job.reviewQuestions)}
          {job.status === 'READY' ? (
            <button
              type="button"
              className="boton-primario"
              disabled={busy}
              onClick={() => void aprobar()}
            >
              Revisar y aprobar los dos borradores
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="admin-help" role="status">
                La aprobación quedó en curso. Si se interrumpió, puedes intentar reanudarla.
              </p>
              <button
                type="button"
                className="boton-secundario"
                disabled={busy}
                onClick={() => void aprobar()}
              >
                Reanudar aprobación
              </button>
            </div>
          )}
        </div>
      )}

      {job?.status === 'FAILED' && (
        <p className="admin-form-error" role="alert">
          {job.error ?? 'Falló la generación.'}
        </p>
      )}
      {job?.status === 'APPROVED' && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="admin-form-success" role="status">
            Los bancos de conocimiento previo y repaso están aprobados.
          </p>
          <button
            type="button"
            className="boton-secundario"
            disabled={busy || flashcardsStatus === 'PROCESSING'}
            onClick={() => void solicitarFlashcards()}
          >
            {flashcardsStatus === 'PROCESSING'
              ? 'Preparando flashcards…'
              : 'Solicitar flashcards de esta semana'}
          </button>
        </div>
      )}
      {flashcardsStatus === 'PROCESSING' && (
        <div className="weekly-ai-progress" role="status" aria-live="polite">
          <span className="weekly-ai-orbit" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <strong>Preparando las flashcards de esta semana</strong>
            <p>
              La cola de generación está procesando el material. El panel se actualizará cuando el
              mazo esté listo.
            </p>
          </div>
        </div>
      )}
      {message && (
        <p className="admin-help" role="status">
          {message}
        </p>
      )}
    </section>
  )
}
