'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { BookOpenCheck, Check, FileText, Pause, Play, RotateCcw, Sparkles, X } from 'lucide-react'

type FuenteFlujo = { titulo: string; tipo: string }

const ETAPAS = [
  { titulo: 'El docente prepara la semana', texto: 'Los objetivos y materiales indican qué debe aprender el grupo.' },
  { titulo: 'Make organiza el proceso', texto: 'Recibe la solicitud y distribuye las fuentes para cada recurso.' },
  { titulo: 'La IA analiza cada documento', texto: 'Extrae el contenido, identifica conceptos y prepara un resumen.' },
  { titulo: 'Se crean los recursos', texto: 'Los conceptos se convierten en preguntas y tarjetas de repaso.' },
  { titulo: 'Borradores listos para revisar', texto: 'El docente revisa los tests y aprueba las flashcards.' },
]

const TIPO_ARCHIVO: Record<string, string> = {
  PDF: 'PDF',
  DOCUMENTO: 'WORD',
  DOCX: 'WORD',
  VIDEO: 'VIDEO',
  ENLACE: 'ENLACE',
}

export const FlujoRecursosAnimado = ({
  weekTitle,
  objectives,
  materials,
  looping,
  runKey,
  onClose,
  onReplay,
}: {
  weekTitle: string
  objectives: string[]
  materials: FuenteFlujo[]
  looping: boolean
  runKey: number
  onClose: () => void
  onReplay: () => void
}): JSX.Element => {
  const root = useRef<HTMLElement>(null)
  const timeline = useRef<gsap.core.Timeline | null>(null)
  const userPaused = useRef(false)
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)
  const progress = useRef<HTMLDivElement>(null)

  const objetivos = objectives.filter(Boolean).slice(0, 3)
  const objetivosVisibles = objetivos.length
    ? objetivos
    : ['Comprender conceptos clave', 'Aplicar lo aprendido', 'Explicar el procedimiento']
  const fuentes = materials.slice(0, 4)
  const fuentesVisibles = fuentes.length
    ? fuentes
    : [
        { titulo: 'Lectura de la semana', tipo: 'PDF' },
        { titulo: 'Presentación de clase', tipo: 'DOCUMENTO' },
        { titulo: 'Ejemplo práctico', tipo: 'PDF' },
        { titulo: 'Video complementario', tipo: 'VIDEO' },
      ]

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const container = root.current
    if (!container) return

    const scenes = gsap.utils.toArray<HTMLElement>('[data-flow-scene]', container)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    gsap.set(scenes, { autoAlpha: 0, y: 18 })
    gsap.set(container.querySelectorAll('[data-flow-enter], [data-flow-question]'), {
      autoAlpha: 0,
      y: 14,
      scale: 0.97,
    })

    if (reducedMotion) {
      const finalScene = scenes[scenes.length - 1]
      if (finalScene) {
        gsap.set(finalScene, { autoAlpha: 1, y: 0 })
        gsap.set(finalScene.querySelectorAll('[data-flow-enter], [data-flow-question]'), {
          autoAlpha: 1,
          y: 0,
          scale: 1,
        })
      }
      setStep(scenes.length - 1)
      setPaused(true)
      userPaused.current = true
      if (progress.current) gsap.set(progress.current, { scaleX: 1, transformOrigin: 'left center' })
      return () => gsap.killTweensOf(scenes)
    }

    const durationByScene = 6.1
    const tl = gsap.timeline({
      paused: true,
      repeat: looping ? -1 : 0,
      repeatDelay: 0.45,
      defaults: { ease: 'power3.out' },
    })
    timeline.current = tl

    scenes.forEach((scene, index) => {
      const start = index * durationByScene
      const incoming = scene.querySelectorAll<HTMLElement>('[data-flow-enter]')
      tl.call(() => setStep(index), [], start)
      tl.to(scene, { autoAlpha: 1, y: 0, duration: 0.62 }, start)
      if (index === 0) {
        const sourceLayout = scene.querySelector<HTMLElement>('.weekly-flow-source-layout')
        if (sourceLayout)
          tl.to(sourceLayout, { x: -32, scale: 0.97, duration: 0.45 }, start + durationByScene - 0.55)
      }
      if (index === 1) {
        const makeNode = scene.querySelector<HTMLElement>('.weekly-flow-make-node')
        if (makeNode) {
          gsap.set(makeNode, { autoAlpha: 0, x: 115, scale: 0.88 })
          tl.to(makeNode, { autoAlpha: 1, x: 0, scale: 1, duration: 0.8 }, start + 0.12)
        }
      }
      incoming.forEach((element, elementIndex) => {
        tl.fromTo(
          element,
          { autoAlpha: 0, y: 14, scale: 0.97 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, immediateRender: false },
          start + 0.25 + elementIndex * 0.12,
        )
      })
      if (index < scenes.length - 1)
        tl.to(scene, { autoAlpha: 0, y: -12, duration: 0.45 }, start + durationByScene - 0.45)
    })

    const beam = container.querySelector<HTMLElement>('[data-flow-scan]')
    if (beam) {
      gsap.set(beam, { y: -125, autoAlpha: 0 })
      tl.to(beam, { autoAlpha: 1, duration: 0.3 }, 2 * durationByScene + 0.9)
      tl.to(beam, { y: 225, duration: 2.6, ease: 'none' }, 2 * durationByScene + 1.1)
      tl.to(beam, { autoAlpha: 0, duration: 0.3 }, 2 * durationByScene + 3.8)
    }

    const highlights = container.querySelectorAll<HTMLElement>('[data-flow-highlight]')
    highlights.forEach((element, index) => {
      tl.fromTo(
        element,
        { backgroundSize: '0% 100%' },
        { backgroundSize: '100% 100%', duration: 0.55, ease: 'power2.out', immediateRender: false },
        2 * durationByScene + 2.1 + index * 0.32,
      )
    })

    const cards = container.querySelectorAll<HTMLElement>('[data-flow-question]')
    cards.forEach((element, index) => {
      tl.fromTo(
        element,
        { x: 24, autoAlpha: 0, rotate: index % 2 ? 2 : -2 },
        { x: 0, autoAlpha: 1, rotate: 0, duration: 0.55, immediateRender: false },
        3 * durationByScene + 0.75 + index * 0.5,
      )
    })

    if (progress.current) {
      gsap.set(progress.current, { scaleX: 0, transformOrigin: 'left center' })
      tl.to(progress.current, {
        scaleX: 1,
        duration: durationByScene * scenes.length,
        ease: 'none',
      }, 0)
    }

    // Cierra el bucle con un fundido para que la vuelta a los objetivos no corte la escena.
    if (looping) {
      const finalScene = scenes[scenes.length - 1]
      const firstScene = scenes[0]
      tl.to(finalScene, { autoAlpha: 0, y: -8, duration: 0.4 }, durationByScene * scenes.length - 0.4)
      tl.to(firstScene, { autoAlpha: 1, y: 0, duration: 0.4 }, durationByScene * scenes.length - 0.4)
    }

    const onVisibility = (): void => {
      if (document.hidden) tl.pause()
      else if (!userPaused.current) tl.play()
    }
    if (!looping) tl.eventCallback('onComplete', () => setPaused(true))
    document.addEventListener('visibilitychange', onVisibility)
    tl.play(0)
    setPaused(false)
    userPaused.current = false

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      tl.kill()
      timeline.current = null
      gsap.killTweensOf(scenes)
    }
    // runKey intentionally remounts this component for a clean replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looping, runKey])

  const alternar = (): void => {
    const tl = timeline.current
    if (!tl) return
    if (tl.paused()) {
      tl.play()
      setPaused(false)
      userPaused.current = false
    } else {
      tl.pause()
      setPaused(true)
      userPaused.current = true
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="weekly-flow-screen-backdrop">
      <section
        ref={root}
        className="weekly-flow-screen"
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-flow-title"
        aria-describedby="weekly-flow-description"
      >
        <header className="weekly-flow-screen-header">
          <div className="weekly-flow-brand"><span><Sparkles size={16} aria-hidden="true" /></span> EDTECH · MAKE + IA</div>
          <button type="button" className="weekly-flow-close" onClick={onClose} aria-label="Cerrar animación">
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="weekly-flow-screen-heading">
          <p>RECORRIDO AUTOMATIZADO · {weekTitle}</p>
          <h2 id="weekly-flow-title">De los materiales semanales a recursos listos para revisar</h2>
          <p id="weekly-flow-description" aria-live="polite">{ETAPAS[step]?.texto}</p>
        </div>

        <main className="weekly-flow-stage" aria-label="Animación del flujo semanal">
          <section className="weekly-flow-scene" data-flow-scene="0" aria-label="Objetivos y materiales">
            <div className="weekly-flow-source-layout">
              <div className="weekly-flow-goals">
                <span className="weekly-flow-kicker">OBJETIVOS DE APRENDIZAJE</span>
                {objetivosVisibles.map((goal, index) => (
                  <article className="weekly-flow-goal" data-flow-enter key={`${goal}-${index}`}>
                    <b>0{index + 1}</b><span>{goal}</span>
                  </article>
                ))}
              </div>
              <div className="weekly-flow-teacher" data-flow-enter>
              <div className="weekly-flow-teacher-avatar" aria-hidden="true">🧑‍🏫</div>
                <strong>Docente</strong>
                <span>Planifica la semana</span>
                <div className="weekly-flow-teacher-note">“Prepara conocimiento previo, repaso y tarjetas.”</div>
              </div>
              <div className="weekly-flow-files">
                <span className="weekly-flow-kicker">MATERIALES DE LA SEMANA</span>
                <div className="weekly-flow-file-grid">
                  {fuentesVisibles.map((material, index) => (
                    <article className={`weekly-flow-file weekly-flow-file-${index % 4}`} data-flow-enter key={`${material.titulo}-${index}`}>
                      <span className="weekly-flow-file-mark"><FileText size={17} aria-hidden="true" /></span>
                      <span><b>{TIPO_ARCHIVO[material.tipo] ?? material.tipo}</b><small>{material.titulo}</small></span>
                    </article>
                  ))}
                </div>
              </div>
            </div>
            <div className="weekly-flow-caption"><span>01</span><strong>Primero se reúne el contexto de la semana</strong><small>Objetivos + fuentes elegidas por el docente</small></div>
          </section>

          <section className="weekly-flow-scene" data-flow-scene="1" aria-label="Make organiza las fuentes">
            <div className="weekly-flow-make-layout">
              <div className="weekly-flow-make-inputs">
                <div className="weekly-flow-make-stack" data-flow-enter><strong>Objetivos</strong>{objetivosVisibles.slice(0, 3).map((goal, i) => <span key={`${goal}-${i}`}>{goal}</span>)}</div>
                <div className="weekly-flow-make-stack weekly-flow-make-stack-files" data-flow-enter><strong>Materiales</strong>{fuentesVisibles.slice(0, 3).map((file, i) => <span key={`${file.titulo}-${i}`}>{TIPO_ARCHIVO[file.tipo] ?? file.tipo} · {file.titulo}</span>)}</div>
              </div>
              <div className="weekly-flow-route-line" aria-hidden="true">⟶</div>
              <div className="weekly-flow-make-node"><span>make</span><b>Coordina el flujo</b><small>Recibe · clasifica · envía</small><i>● <em>escenario activo</em></i></div>
              <div className="weekly-flow-make-tasks">
                <div data-flow-enter><Check size={15} aria-hidden="true" /> Conocimiento previo</div>
                <div data-flow-enter><Check size={15} aria-hidden="true" /> Contenido semanal</div>
                <div data-flow-enter><Check size={15} aria-hidden="true" /> Repaso</div>
              </div>
            </div>
            <div className="weekly-flow-caption"><span>02</span><strong>Make distribuye cada fuente según su propósito</strong><small>El flujo prepara solicitudes separadas para diagnóstico y repaso</small></div>
          </section>

          <section className="weekly-flow-scene" data-flow-scene="2" aria-label="La IA analiza los documentos">
            <div className="weekly-flow-analysis-layout">
              <div className="weekly-flow-document" data-flow-enter>
                <div className="weekly-flow-document-head"><FileText size={17} aria-hidden="true" /><span>Documento de la semana</span><i>ANÁLISIS IA</i></div>
                <div className="weekly-flow-scan-window">
                  <div className="weekly-flow-scan-beam" data-flow-scan />
                  <span className="weekly-flow-text-line long" />
                  <span className="weekly-flow-text-line medium" />
                  <span className="weekly-flow-text-line"><b data-flow-highlight>Concepto principal</b> y definición</span>
                  <span className="weekly-flow-text-line long" />
                  <span className="weekly-flow-text-line"><b data-flow-highlight>Procedimiento paso a paso</b></span>
                  <span className="weekly-flow-text-line medium" />
                  <span className="weekly-flow-text-line long" />
                  <span className="weekly-flow-text-line"><b data-flow-highlight>Ejemplo de aplicación</b></span>
                </div>
                <div className="weekly-flow-extract-status"><span className="weekly-flow-pulse" /> Texto extraído y puntos clave identificados</div>
              </div>
              <div className="weekly-flow-insight-list">
                <div className="weekly-flow-insight" data-flow-enter><span>01</span><div><b>Lee el archivo</b><small>PDF, Word y fuentes seleccionadas</small></div></div>
                <div className="weekly-flow-insight" data-flow-enter><span>02</span><div><b>Subraya ideas centrales</b><small>Conceptos, pasos y ejemplos</small></div></div>
                <div className="weekly-flow-insight" data-flow-enter><span>03</span><div><b>Prepara un resumen</b><small>Insumo para preguntas y flashcards</small></div></div>
              </div>
            </div>
            <div className="weekly-flow-caption"><span>03</span><strong>La IA lee y sintetiza el contenido útil</strong><small>La animación representa el análisis automático de los materiales</small></div>
          </section>

          <section className="weekly-flow-scene" data-flow-scene="3" aria-label="Creación de tests y flashcards">
            <div className="weekly-flow-build-layout">
              <article className="weekly-flow-quiz-card" data-flow-question>
                <div className="weekly-flow-quiz-head"><span>TEST 01 · DIAGNÓSTICO</span><b>5 preguntas</b></div>
                <h3>Conocimiento previo · {weekTitle}</h3>
                <div className="weekly-flow-question"><b>Pregunta 1</b><p>¿Qué concepto conviene conocer antes de empezar esta semana?</p><span>○ Opción A</span><span className="is-answer">● Opción B <i>Correcta</i></span><span>○ Opción C</span></div>
              </article>
              <article className="weekly-flow-quiz-card weekly-flow-quiz-purple" data-flow-question>
                <div className="weekly-flow-quiz-head"><span>TEST 02 · REPASO</span><b>5 preguntas</b></div>
                <h3>Repaso · {weekTitle}</h3>
                <div className="weekly-flow-question"><b>Pregunta 1</b><p>¿Cómo se aplica el procedimiento revisado?</p><span>○ Opción A</span><span>○ Opción B</span><span className="is-answer">● Opción C <i>Correcta</i></span></div>
              </article>
              <article className="weekly-flow-summary-card" data-flow-enter>
                <span className="weekly-flow-summary-icon"><BookOpenCheck size={19} aria-hidden="true" /></span>
                <b>Resumen clave</b><small>Conceptos + ejemplos + definiciones</small>
                <div className="weekly-flow-flash-stack"><span>¿Qué es el concepto principal?</span><span>Define los pasos del proceso</span><span>¿Cuándo se aplica?</span></div>
                <strong>Flashcards</strong>
              </article>
            </div>
            <div className="weekly-flow-caption"><span>04</span><strong>Del resumen salen dos tests y fichas de estudio</strong><small>Los borradores conservan sus objetivos y materiales de origen</small></div>
          </section>

          <section className="weekly-flow-scene" data-flow-scene="4" aria-label="Recursos listos para revisión">
            <div className="weekly-flow-ready-layout">
              <div className="weekly-flow-ready-check"><span><Check size={27} aria-hidden="true" /></span><div><strong>Recursos preparados</strong><small>El docente conserva el control antes de publicarlos.</small></div></div>
              <div className="weekly-flow-ready-cards">
                <article data-flow-enter><span className="weekly-flow-ready-icon blue"><FileText size={18} aria-hidden="true" /></span><small>BORRADOR</small><b>Test de conocimiento previo</b><span>5 preguntas · diagnóstico</span><button type="button" tabIndex={-1}>Revisar</button></article>
                <article data-flow-enter><span className="weekly-flow-ready-icon purple"><FileText size={18} aria-hidden="true" /></span><small>BORRADOR</small><b>Test de repaso</b><span>5 preguntas · práctica</span><button type="button" tabIndex={-1}>Revisar</button></article>
                <article data-flow-enter><span className="weekly-flow-ready-icon green"><BookOpenCheck size={18} aria-hidden="true" /></span><small>PARA REVISIÓN</small><b>Flashcards</b><span>Tarjetas de estudio</span><button type="button" tabIndex={-1}>Revisar</button></article>
              </div>
            </div>
            <div className="weekly-flow-caption"><span>05</span><strong>La automatización termina con borradores, no con publicación automática</strong><small>El docente revisa y aprueba antes de que el grupo los use</small></div>
          </section>
        </main>

        <footer className="weekly-flow-screen-footer">
          <div className="weekly-flow-progress" role="progressbar" aria-label="Progreso del recorrido" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(((step + 1) / ETAPAS.length) * 100)}>
            <div ref={progress} />
          </div>
          <div className="weekly-flow-controls">
            <div className="weekly-flow-stage-label"><b>0{step + 1}</b><span>{ETAPAS[step]?.titulo}</span></div>
            <div className="weekly-flow-control-buttons">
              <button
                type="button"
                className="weekly-flow-play"
                onClick={alternar}
                disabled={!timeline.current || (!looping && timeline.current.progress() >= 1)}
                aria-label={paused ? 'Reproducir animación' : 'Pausar animación'}
              >
                {paused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}
              </button>
              <button type="button" className="weekly-flow-replay" onClick={onReplay}>
                <RotateCcw size={15} aria-hidden="true" /> Reiniciar
              </button>
              <button type="button" className="weekly-flow-finish" onClick={onClose}>Volver al editor</button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  )
}
