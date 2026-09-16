'use client'

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'

type MessageRole = 'user' | 'assistant'

type AssistantMessage = {
  id: string
  role: MessageRole
  content: string
}

const INITIAL_MESSAGE: AssistantMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Hola, soy el asistente de EdTech. Puedo explicarte cómo funcionan los cursos, las rutas y las insignias. ¿Qué te gustaría conocer?',
}

const getErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: unknown }
    return typeof body.error === 'string' ? body.error : fallback
  } catch {
    return fallback
  }
}

const AssistantWidget = (): JSX.Element => {
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<AssistantMessage[]>([INITIAL_MESSAGE])
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const stopTimerRef = useRef<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, isSending, isTranscribing])

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current)
      recorderRef.current?.stop()
      streamRef.current?.getTracks().forEach(track => track.stop())
    }
  }, [])

  const transcribeAudio = async (blob: Blob): Promise<void> => {
    setIsTranscribing(true)
    setError(null)

    try {
      const form = new FormData()
      const extension = blob.type.includes('mp4') ? 'm4a' : 'webm'
      form.append('audio', blob, `edtech-message.${extension}`)
      const response = await fetch('/api/assistant/transcribe', { method: 'POST', body: form })
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'No pude transcribir el audio.'))
      }

      const body = (await response.json()) as { text?: unknown }
      if (typeof body.text !== 'string' || !body.text.trim()) {
        throw new Error('No encontré palabras claras en el audio.')
      }

      const transcribedText = body.text.trim()
      setDraft(current => (current ? `${current} ${transcribedText}` : transcribedText).trim())
    } catch (transcriptionError) {
      setError(
        transcriptionError instanceof Error
          ? transcriptionError.message
          : 'No pude transcribir el audio.',
      )
    } finally {
      setIsTranscribing(false)
    }
  }

  const stopRecording = (): void => {
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current)
    stopTimerRef.current = null

    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
      return
    }

    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    setIsRecording(false)
  }

  const startRecording = async (): Promise<void> => {
    if (isRecording || isTranscribing || isSending) return
    setError(null)

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Tu navegador no permite grabar audio aquí.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type =>
        MediaRecorder.isTypeSupported(type),
      )
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      chunksRef.current = []
      streamRef.current = stream
      recorderRef.current = recorder
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const audio = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        })
        stream.getTracks().forEach(track => track.stop())
        streamRef.current = null
        recorderRef.current = null
        setIsRecording(false)
        if (audio.size > 0) void transcribeAudio(audio)
      }
      recorder.start()
      setIsRecording(true)
      stopTimerRef.current = window.setTimeout(stopRecording, 60_000)
    } catch {
      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = null
      setError('No pude acceder al micrófono. Revisa los permisos del navegador.')
    }
  }

  const sendMessage = async (): Promise<void> => {
    const content = draft.trim()
    if (!content || isSending || isRecording || isTranscribing) return

    const userMessage: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
    }
    const history = [...messages, userMessage].slice(-10)
    setMessages(current => [...current, userMessage])
    setDraft('')
    setError(null)
    setIsSending(true)

    try {
      const response = await fetch('/api/assistant/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map(({ role, content: messageContent }) => ({
            role,
            content: messageContent,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'No pude responder ahora.'))
      }

      const body = (await response.json()) as { text?: unknown }
      if (typeof body.text !== 'string' || !body.text.trim()) {
        throw new Error('El asistente no devolvió una respuesta.')
      }

      const assistantText = body.text.trim()
      setMessages(current => [
        ...current,
        { id: `assistant-${Date.now()}`, role: 'assistant', content: assistantText },
      ])
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'No pude responder ahora.')
    } finally {
      setIsSending(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void sendMessage()
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  return (
    <div className="assistant-widget">
      {isOpen ? (
        <section
          className="assistant-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="assistant-title"
        >
          <header className="assistant-header">
            <div>
              <p className="assistant-kicker">EDTECH / SUPPORT</p>
              <h2 id="assistant-title">Asistente EdTech</h2>
            </div>
            <button
              type="button"
              className="assistant-close"
              onClick={() => setIsOpen(false)}
              aria-label="Cerrar asistente"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </header>

          <div className="assistant-messages" aria-live="polite">
            {messages.map(message => (
              <div
                key={message.id}
                className={`assistant-message assistant-message-${message.role}`}
              >
                <span className="assistant-message-label">
                  {message.role === 'user' ? 'Tú' : 'EdTech'}
                </span>
                <p>{message.content}</p>
              </div>
            ))}
            {(isSending || isTranscribing) && (
              <p className="assistant-status">
                <span>{isTranscribing ? 'Transcribiendo audio' : 'Pensando'}</span>
                <span className="assistant-typing" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </p>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="assistant-composer" onSubmit={handleSubmit}>
            <div className="assistant-composer-row">
              <textarea
                className="assistant-input"
                value={draft}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Pregúntame por los cursos o insignias"
                aria-label="Mensaje para el asistente"
                rows={2}
                maxLength={1000}
                disabled={isSending || isTranscribing}
              />
              <div className="assistant-composer-actions">
                <button
                  type="button"
                  className={`assistant-action ${isRecording ? 'assistant-action-recording' : ''}`}
                  onClick={isRecording ? stopRecording : () => void startRecording()}
                  disabled={isTranscribing || isSending}
                  aria-label={isRecording ? 'Detener grabación' : 'Grabar audio'}
                  aria-pressed={isRecording}
                  title={isRecording ? 'Detener grabación' : 'Grabar audio'}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 0 0-7 0v5a3.5 3.5 0 0 0 3.5 3.5Z" />
                    <path d="M18.5 11a6.5 6.5 0 0 1-13 0M12 17.5V21M8.5 21h7" />
                  </svg>
                </button>
                <button
                  type="submit"
                  className="assistant-send"
                  disabled={!draft.trim() || isSending || isRecording || isTranscribing}
                  aria-label="Enviar mensaje"
                  title="Enviar mensaje"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m5 12 14-7-4 14-3-6-7-1Zm7 1 7-8" />
                  </svg>
                </button>
              </div>
            </div>
            {error && (
              <p className="assistant-error" role="alert">
                {error}
              </p>
            )}
          </form>
        </section>
      ) : (
        <button type="button" className="assistant-toggle" onClick={() => setIsOpen(true)}>
          <span className="assistant-toggle-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm6.5 12 0.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
            </svg>
          </span>
          <span className="assistant-toggle-copy">
            <strong>¿Necesitas ayuda?</strong>
            <small>Asistente EdTech</small>
          </span>
        </button>
      )}
    </div>
  )
}

export default AssistantWidget
