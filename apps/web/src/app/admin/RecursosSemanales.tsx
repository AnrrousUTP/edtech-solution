'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { MazoAdmin } from '@/api/resto'
import type { PreguntaEvaluacionBorrador } from '@/lib/assistant/bedrock'
import { FlujoRecursosAnimado } from './FlujoRecursosAnimado'

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
  objectives,
  materials,
  onPrepare,
  onRequestFlashcards,
}: {
  courseId: string
  tomoId: string
  weekTitle: string
  objectives: string[]
  materials: { titulo: string; tipo: string }[]
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
  const [revisionAbierta, setRevisionAbierta] = useState(false)

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

  useEffect(() => {
    if (job?.status === 'READY' || job?.status === 'FAILED' || job?.status === 'APPROVED')
      setShowFlow(false)
  }, [job?.status])

  useEffect(() => {
    setRevisionAbierta(false)
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
    setShowFlow(true)
    setFlowRun(value => value + 1)
    setRevisionAbierta(false)
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
      setShowFlow(false)
      setMessage(error instanceof Error ? error.message : 'No se pudo iniciar la automatización.')
    } finally {
      setBusy(false)
    }
  }

  const reconsultarTrabajo = async (): Promise<void> => {
    if (!job) return
    setBusy(true)
    setMessage(null)
    setShowFlow(true)
    setFlowRun(value => value + 1)
    try {
      const status = await consultarTrabajo(job.jobId)
      if (status === 'QUEUED' || status === 'PROCESSING' || status === 'APPROVING')
        setMessage('El trabajo sigue activo. Vuelve a consultar en un momento.')
    } catch (error) {
      setShowFlow(false)
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
      setShowFlow(true)
      setFlowRun(value => value + 1)
      const status = await consultarTrabajo(job.jobId)
      if (status === 'QUEUED' || status === 'PROCESSING' || status === 'APPROVING')
        setMessage('Make recibió el reintento. El proceso sigue activo; puedes consultar su estado.')
    } catch (error) {
      setShowFlow(false)
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
          <button
            className="boton-secundario weekly-flow-toggle"
            type="button"
            onClick={() => {
              setFlowRun(value => value + 1)
              setShowFlow(true)
            }}
          >
            Ver recorrido animado
          </button>
        </div>
      </div>

      {showFlow && (
        <FlujoRecursosAnimado
          key={flowRun}
          weekTitle={weekTitle}
          objectives={objectives}
          materials={materials}
          looping={
            busy || job?.status === 'QUEUED' || job?.status === 'PROCESSING' || job?.status === 'APPROVING'
          }
          runKey={flowRun}
          onClose={() => setShowFlow(false)}
          onReplay={() => setFlowRun(value => value + 1)}
        />
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
          {job.status === 'READY' && !revisionAbierta ? (
            <div className="weekly-ready-cards">
              <article className="weekly-ready-card weekly-ready-card-blue">
                <span>TEST 01 · BORRADOR</span>
                <strong>Test de conocimiento previo</strong>
                <small>{job.priorQuestions?.length ?? 0} preguntas · Diagnóstico</small>
                <button type="button" className="boton-secundario" onClick={() => setRevisionAbierta(true)}>
                  Revisar
                </button>
              </article>
              <article className="weekly-ready-card weekly-ready-card-purple">
                <span>TEST 02 · BORRADOR</span>
                <strong>Test de repaso</strong>
                <small>{job.reviewQuestions?.length ?? 0} preguntas · Práctica</small>
                <button type="button" className="boton-secundario" onClick={() => setRevisionAbierta(true)}>
                  Revisar
                </button>
              </article>
              <article className="weekly-ready-card weekly-ready-card-green">
                <span>FLASHCARDS</span>
                <strong>Tarjetas de estudio</strong>
                <small>Se preparan después de aprobar los tests.</small>
                <span className="weekly-ready-after-approval">Después de la aprobación</span>
              </article>
            </div>
          ) : (
            <>
              {renderQuestions('Test de conocimiento previo', job.priorQuestions)}
              {renderQuestions('Test de repaso', job.reviewQuestions)}
              {job.status === 'READY' ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="boton-secundario" onClick={() => setRevisionAbierta(false)}>
                    Volver a resultados
                  </button>
                  <button
                    type="button"
                    className="boton-primario"
                    disabled={busy}
                    onClick={() => void aprobar()}
                  >
                    Aprobar tests y preparar flashcards
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="admin-help" role="status">
                    La aprobación quedó en curso. Si se interrumpió, puedes reanudarla.
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
            </>
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
