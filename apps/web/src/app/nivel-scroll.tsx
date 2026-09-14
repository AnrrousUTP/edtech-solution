'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

type Nivel = {
  numero: string
  lenguaje: string
  etapa: string
  titulo: string
  descripcion: string
  archivo: string
  accent: string
  tools: string[]
  locked?: boolean
  lineas: Array<{ numero: string; contenido: ReactNode }>
}

const NIVELES: Nivel[] = [
  {
    numero: '01',
    lenguaje: 'PYTHON',
    etapa: 'SYNTAX / START',
    titulo: 'Todo comienza con una línea.',
    descripcion:
      'Aprende a pensar como programador escribiendo tu primer programa y entendiendo qué devuelve cada instrucción.',
    archivo: 'hello.py',
    accent: '#ffd343',
    tools: ['syntax', 'variables', 'logic'],
    lineas: [
      {
        numero: '01',
        contenido: (
          <>
            <span className="scroll-syntax-function">print</span>(
            <span className="scroll-syntax-string">"Hello, World!"</span>)
          </>
        ),
      },
      {
        numero: '02',
        contenido: <span className="scroll-syntax-comment"># tu primera salida</span>,
      },
    ],
  },
  {
    numero: '02',
    lenguaje: 'PYTHON',
    etapa: 'TOOLS / BUILD',
    titulo: 'Aprende tus herramientas.',
    descripcion:
      'Terminal, Git y un editor: las herramientas convierten una idea en trabajo repetible y visible.',
    archivo: 'tools.py',
    accent: '#ffd343',
    tools: ['terminal', 'git', 'editor'],
    lineas: [
      {
        numero: '01',
        contenido: (
          <>
            <span className="scroll-syntax-keyword">from</span> tools{' '}
            <span className="scroll-syntax-keyword">import</span> terminal
          </>
        ),
      },
      {
        numero: '02',
        contenido: (
          <>
            <span className="scroll-syntax-function">terminal</span>.
            <span className="scroll-syntax-function">run</span>(
            <span className="scroll-syntax-string">"git status"</span>)
          </>
        ),
      },
    ],
  },
  {
    numero: '03',
    lenguaje: 'PYTHON',
    etapa: 'HARNESS / SYSTEM',
    titulo: 'Construye tu entorno.',
    descripcion:
      'Un harness te permite probar, repetir y mejorar cada solución sin perder el contexto de lo que aprendiste.',
    archivo: 'harness.py',
    accent: '#ffd343',
    tools: ['run', 'test', 'repeat'],
    lineas: [
      {
        numero: '01',
        contenido: (
          <>
            <span className="scroll-syntax-keyword">def</span>{' '}
            <span className="scroll-syntax-function">run</span>(skill):
          </>
        ),
      },
      {
        numero: '02',
        contenido: (
          <>
            &nbsp;&nbsp;&nbsp;&nbsp;<span className="scroll-syntax-keyword">return</span> skill.
            <span className="scroll-syntax-function">execute</span>()
          </>
        ),
      },
    ],
  },
  {
    numero: '04',
    lenguaje: 'PYTHON',
    etapa: 'SKILLS / PROOF',
    titulo: 'Demuestra lo que sabes.',
    descripcion:
      'Resuelve retos, crea proyectos y convierte práctica en evidencia que puedas compartir.',
    archivo: 'skills.py',
    accent: '#ffd343',
    tools: ['challenge', 'project', 'proof'],
    lineas: [
      {
        numero: '01',
        contenido: (
          <>
            <span className="scroll-syntax-function">skills</span>.
            <span className="scroll-syntax-function">unlock</span>(
            <span className="scroll-syntax-string">"web"</span>)
          </>
        ),
      },
      {
        numero: '02',
        contenido: <span className="scroll-syntax-comment"># nivel desbloqueado</span>,
      },
    ],
  },
  {
    numero: '05',
    lenguaje: 'JAVASCRIPT',
    etapa: 'NEXT / INTERACTION',
    titulo: 'Haz que las ideas respondan.',
    descripcion: 'Interacción, navegador y productos que reaccionan a las personas.',
    archivo: 'unlock.js',
    accent: '#f7df1e',
    locked: true,
    tools: ['dom', 'events', 'ui'],
    lineas: [
      {
        numero: '01',
        contenido: (
          <>
            <span className="scroll-syntax-keyword">const</span> next ={' '}
            <span className="scroll-syntax-string">"JavaScript"</span>
          </>
        ),
      },
      {
        numero: '02',
        contenido: (
          <>
            <span className="scroll-syntax-function">console</span>.
            <span className="scroll-syntax-function">log</span>(
            <span className="scroll-syntax-string">"LOCKED"</span>)
          </>
        ),
      },
    ],
  },
  {
    numero: '06',
    lenguaje: 'C#',
    etapa: 'SYSTEMS / SCALE',
    titulo: 'Diseña sistemas grandes.',
    descripcion: 'Arquitectura, objetos y servicios preparados para crecer.',
    archivo: 'Program.cs',
    accent: '#8b7cf6',
    locked: true,
    tools: ['objects', 'architecture', 'scale'],
    lineas: [
      {
        numero: '01',
        contenido: (
          <>
            <span className="scroll-syntax-keyword">public class</span> EdTech
          </>
        ),
      },
      {
        numero: '02',
        contenido: (
          <>
            &nbsp;&nbsp;<span className="scroll-syntax-comment">// desbloquea este nivel</span>
          </>
        ),
      },
    ],
  },
  {
    numero: '07',
    lenguaje: 'RUBY',
    etapa: 'CRAFT / EXPRESS',
    titulo: 'Escribe con intención.',
    descripcion: 'Código expresivo para resolver problemas con claridad.',
    archivo: 'hello.rb',
    accent: '#ef5555',
    locked: true,
    tools: ['craft', 'clarity', 'speed'],
    lineas: [
      {
        numero: '01',
        contenido: (
          <>
            <span className="scroll-syntax-function">puts</span>{' '}
            <span className="scroll-syntax-string">"Hello, World!"</span>
          </>
        ),
      },
      {
        numero: '02',
        contenido: <span className="scroll-syntax-comment"># próximo lenguaje</span>,
      },
    ],
  },
  {
    numero: '08',
    lenguaje: 'GO / RUST',
    etapa: 'PERFORMANCE / DEEP',
    titulo: 'Piensa en rendimiento.',
    descripcion: 'Conoce las herramientas que viven cerca del sistema.',
    archivo: 'main.rs',
    accent: '#dea584',
    locked: true,
    tools: ['memory', 'speed', 'systems'],
    lineas: [
      {
        numero: '01',
        contenido: (
          <>
            <span className="scroll-syntax-keyword">fn</span>{' '}
            <span className="scroll-syntax-function">main</span>() {'{'}
          </>
        ),
      },
      {
        numero: '02',
        contenido: (
          <>
            &nbsp;&nbsp;<span className="scroll-syntax-function">println!</span>(
            <span className="scroll-syntax-string">"fast"</span>);
          </>
        ),
      },
    ],
  },
  {
    numero: '09',
    lenguaje: 'ASSEMBLY',
    etapa: 'HACKER / MACHINE',
    titulo: 'Baja hasta el metal.',
    descripcion: 'Entiende qué ocurre debajo de cada abstracción.',
    archivo: 'machine.asm',
    accent: '#8df59a',
    locked: true,
    tools: ['cpu', 'memory', 'machine'],
    lineas: [
      {
        numero: '01',
        contenido: (
          <>
            <span className="scroll-syntax-keyword">mov</span> edx, message
          </>
        ),
      },
      { numero: '02', contenido: <span className="scroll-syntax-comment">; access denied</span> },
    ],
  },
]

const NivelScroll = (): JSX.Element => {
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    const root = rootRef.current
    if (!root) return

    const context = gsap.context(() => {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const reveals = gsap.utils.toArray<HTMLElement>('.story-reveal:not(.story-hero)')
      const panels = gsap.utils.toArray<HTMLElement>('.story-panel')
      const progress = root.querySelector<HTMLElement>('.story-progress')
      const progressFill = root.querySelector<HTMLElement>('.story-progress-fill')
      const progressLabel = root.querySelector<HTMLElement>('.story-progress-label')
      const world = root.querySelector<HTMLElement>('.edtech-world-rail')
      const worldCore = root.querySelector<HTMLElement>('.edtech-world-core')
      const worldPath = root.querySelector<SVGPathElement>('.edtech-world-route-path')
      const worldNodes = gsap.utils.toArray<HTMLElement>('.edtech-world-node')

      if (!reducedMotion) {
        reveals.forEach(element => {
          gsap.fromTo(
            element,
            { autoAlpha: 0, y: 48 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.8,
              ease: 'power3.out',
              scrollTrigger: {
                trigger: element,
                start: 'top 82%',
                toggleActions: 'play none none reverse',
              },
            },
          )
          if (element.getBoundingClientRect().top < window.innerHeight * 0.82) {
            gsap.set(element, { autoAlpha: 1, y: 0 })
          }
        })
        const hero = root.querySelector<HTMLElement>('.story-hero')
        if (hero) {
          gsap.to(hero.querySelector('.story-hero-copy'), {
            y: 72,
            autoAlpha: 0.35,
            ease: 'none',
            scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 1 },
          })
          gsap.to(hero.querySelector('.story-hero-code'), {
            y: -105,
            rotate: 2,
            ease: 'none',
            scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 1.2 },
          })
        }
        panels.forEach((panel, index) => {
          const codeWindow = panel.querySelector<HTMLElement>('.story-code-window')
          const codeLines = gsap.utils.toArray<HTMLElement>(
            '.story-code-line',
            codeWindow ?? undefined,
          )
          const watermark = panel.querySelector<HTMLElement>('.story-panel-mark')
          if (codeWindow) {
            gsap.fromTo(
              codeWindow,
              { rotateY: index % 2 === 0 ? 8 : -8, y: 60, autoAlpha: 0.35 },
              {
                rotateY: 0,
                y: 0,
                autoAlpha: 1,
                duration: 1.05,
                ease: 'power3.out',
                scrollTrigger: {
                  trigger: panel,
                  start: 'top 76%',
                  toggleActions: 'play none none reverse',
                },
              },
            )
          }
          gsap.fromTo(
            codeLines,
            { autoAlpha: 0, x: index % 2 === 0 ? -22 : 22 },
            {
              autoAlpha: 1,
              x: 0,
              duration: 0.48,
              stagger: 0.13,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: panel,
                start: 'top 70%',
                toggleActions: 'play none none reverse',
              },
            },
          )
          if (watermark) {
            gsap.to(watermark, {
              x: index % 2 === 0 ? 90 : -90,
              autoAlpha: 0.18,
              ease: 'none',
              scrollTrigger: { trigger: panel, start: 'top bottom', end: 'bottom top', scrub: 1 },
            })
          }
        })
        gsap.to('.story-grid', {
          backgroundPosition: '0 80px',
          ease: 'none',
          scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true },
        })
        if (worldCore)
          gsap.to(worldCore, {
            rotate: 360,
            ease: 'none',
            scrollTrigger: { trigger: root, start: 'top top', end: 'bottom bottom', scrub: 1 },
          })
        if (world)
          gsap.to(world, {
            rotate: 7,
            scale: 1.05,
            ease: 'none',
            scrollTrigger: { trigger: root, start: 'top top', end: 'bottom bottom', scrub: 1.2 },
          })
      }

      ScrollTrigger.create({
        trigger: root,
        start: 'top top',
        end: 'bottom bottom',
        onEnter: () => progress && gsap.set(progress, { autoAlpha: 1 }),
        onLeave: () => progress && gsap.set(progress, { autoAlpha: 0 }),
        onEnterBack: () => progress && gsap.set(progress, { autoAlpha: 1 }),
        onLeaveBack: () => progress && gsap.set(progress, { autoAlpha: 0 }),
        onUpdate: self => {
          const percentage = Math.round(self.progress * 100)
          if (progressFill) gsap.set(progressFill, { scaleX: self.progress })
          if (progressLabel)
            progressLabel.textContent = `${String(percentage).padStart(2, '0')}% COMPILED`
          if (world) world.style.setProperty('--world-progress', String(self.progress))
          if (worldPath) worldPath.style.strokeDashoffset = String(520 - self.progress * 520)
          worldNodes.forEach((node, index) => {
            const threshold = index / Math.max(worldNodes.length - 1, 1)
            gsap.set(node, { autoAlpha: self.progress >= threshold - 0.08 ? 1 : 0.28 })
          })
        },
      })
    }, root)

    return () => context.revert()
  }, [])

  const activeLevels = NIVELES.slice(0, 4)
  const lockedLevels = NIVELES.slice(4)

  return (
    <section ref={rootRef} className="level-scroll" aria-label="Progresión de niveles de EdTech">
      <div className="story-grid" aria-hidden="true" />
      <div className="edtech-world-rail" aria-hidden="true">
        <span className="edtech-world-caption">EDTECH / LEARNING WORLD</span>
        <span className="edtech-world-orbit edtech-world-orbit-one" />
        <span className="edtech-world-orbit edtech-world-orbit-two" />
        <svg className="edtech-world-route" viewBox="0 0 260 260" focusable="false">
          <path
            className="edtech-world-route-path"
            d="M34 196 C42 122 74 218 116 153 S174 35 226 74"
          />
        </svg>
        <div className="edtech-world-core">
          <b>E</b>
          <span>BUILD</span>
        </div>
        <span className="edtech-world-node edtech-world-node-one">
          <b>01</b>
          <span>SYNTAX</span>
        </span>
        <span className="edtech-world-node edtech-world-node-two">
          <b>02</b>
          <span>TOOLS</span>
        </span>
        <span className="edtech-world-node edtech-world-node-three">
          <b>03</b>
          <span>HARNESS</span>
        </span>
        <span className="edtech-world-node edtech-world-node-four">
          <b>04</b>
          <span>PROOF</span>
        </span>
      </div>
      <div className="story-progress" aria-hidden="true">
        <span className="story-progress-label">00% COMPILED</span>
        <span className="story-progress-track">
          <i className="story-progress-fill" />
        </span>
      </div>

      <section className="story-hero story-reveal">
        <div className="story-hero-copy">
          <p className="level-overline">
            <span className="level-pulse" /> EDTECH / LEARNING SYSTEM
          </p>
          <h1>
            Demuestra tu <span>nivel.</span>
          </h1>
          <p className="level-welcome-copy">
            Aprende escribiendo. Avanza construyendo. Deja evidencia.
          </p>
          <div className="story-command">
            <span>edtech@workspace:~$</span> run diagnostic <b>▋</b>
          </div>
        </div>
        <div className="story-hero-code story-code-window">
          <div className="story-code-bar">
            <span>edtech://hello.py</span>
            <span>RUNNING / 01</span>
          </div>
          <div className="story-code-editor">
            <div className="story-code-line">
              <span>01</span>
              <code>
                <span className="scroll-syntax-function">print</span>(
                <span className="scroll-syntax-string">"Hello, World!"</span>)
              </code>
            </div>
            <div className="story-code-line">
              <span>02</span>
              <code>
                <span className="scroll-syntax-comment"># tu código empieza aquí</span>
              </code>
            </div>
            <i className="story-code-cursor">▋</i>
          </div>
          <div className="story-code-output">
            <span>OUTPUT</span>
            <b>✓ Hello, World!</b>
          </div>
        </div>
        <div className="story-scroll-cue">
          <span>SCROLL TO COMPILE</span>
          <b>↓</b>
        </div>
      </section>

      <section className="story-intro story-reveal">
        <p className="story-section-label">00 / THE METHOD</p>
        <h2>
          Aprender no es acumular.
          <br />
          <span>Es dejar rastro.</span>
        </h2>
        <p>
          EdTech transforma cada sesión en una secuencia visible: escribes código, usas
          herramientas, repites una solución y construyes una prueba de lo que sabes.
        </p>
      </section>

      <div className="story-panels">
        {activeLevels.map((nivel, index) => (
          <article
            key={nivel.numero}
            className={`story-panel story-panel-${index + 1} story-reveal`}
            style={{ '--level-accent': nivel.accent } as CSSProperties}
          >
            <div className="story-panel-mark" aria-hidden="true">
              {nivel.numero}
            </div>
            <div className="story-panel-meta">
              <span>{nivel.etapa}</span>
              <span>{index + 1} / 04 ACTIVE PATH</span>
            </div>
            <div className="story-panel-content">
              <div className="story-panel-copy">
                <p className="level-number">LEVEL {nivel.numero}</p>
                <p className="level-language">{nivel.lenguaje}</p>
                <h2>{nivel.titulo}</h2>
                <p>{nivel.descripcion}</p>
                <div className="story-tools">
                  {nivel.tools.map(tool => (
                    <span key={tool}>{tool}</span>
                  ))}
                </div>
                {index === 1 && (
                  <div className="story-tool-orbit">
                    <span>TERMINAL</span>
                    <b>GIT</b>
                    <i>EDITOR</i>
                  </div>
                )}
                {index === 2 && (
                  <div className="story-harness-status">
                    <span>HARNESS STATUS</span>
                    <b>3 / 3 TESTS PASSED</b>
                    <i>
                      <em />
                    </i>
                  </div>
                )}
                {index === 3 && (
                  <div className="story-proof-signal">
                    <span>PROOF GENERATED</span>
                    <b>PY-004 / READY TO SHARE</b>
                  </div>
                )}
              </div>
              <div className="story-code-window">
                <div className="story-code-bar">
                  <span>edtech://{nivel.archivo}</span>
                  <span>RUNNING</span>
                </div>
                <div className="story-code-editor">
                  {nivel.lineas.map(linea => (
                    <div className="story-code-line" key={linea.numero}>
                      <span>{linea.numero}</span>
                      <code>{linea.contenido}</code>
                    </div>
                  ))}
                  <i className="story-code-cursor">▋</i>
                </div>
                <div className="story-code-output">
                  <span>OUTPUT</span>
                  <b>✓ {index === 3 ? 'proof created' : 'task passed'}</b>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <section className="story-tracking story-reveal">
        <div className="story-tracking-copy">
          <p className="story-section-label">05 / YOUR TRACE</p>
          <h2>
            Tu progreso
            <br />
            <span>deja señales.</span>
          </h2>
          <p>
            Cada reto completado actualiza tu recorrido. No ves una barra vacía: ves decisiones,
            commits y habilidades que ya puedes usar.
          </p>
        </div>
        <div className="story-tracking-terminal">
          <div className="tracking-top">
            <span>edtech@progress:~$</span>
            <b>git log --oneline</b>
          </div>
          <div className="tracking-row">
            <i>01</i>
            <b>init</b>
            <span>Hello, World!</span>
            <em>passed</em>
          </div>
          <div className="tracking-row">
            <i>02</i>
            <b>feat</b>
            <span>Terminal + Git</span>
            <em>passed</em>
          </div>
          <div className="tracking-row">
            <i>03</i>
            <b>test</b>
            <span>Harness de aprendizaje</span>
            <em>passed</em>
          </div>
          <div className="tracking-row is-next">
            <i>04</i>
            <b>next</b>
            <span>JavaScript</span>
            <em>locked</em>
          </div>
          <div className="tracking-total">
            <span>4 / 12 checkpoints</span>
            <i>
              <b />
            </i>
            <strong>33%</strong>
          </div>
        </div>
      </section>

      <section className="story-roadmap story-reveal">
        <div className="story-roadmap-head">
          <div>
            <p className="story-section-label">06 / NEXT LANGUAGES</p>
            <h2>
              El siguiente nivel
              <br />
              <span>se desbloquea.</span>
            </h2>
          </div>
          <p>Todos empiezan en Python. El dominio abre nuevas formas de pensar.</p>
        </div>
        <div className="story-roadmap-grid">
          {lockedLevels.map(nivel => (
            <article
              key={nivel.numero}
              className="story-roadmap-card"
              style={{ '--level-accent': nivel.accent } as CSSProperties}
            >
              <span>{nivel.numero}</span>
              <b>{nivel.lenguaje}</b>
              <small>{nivel.etapa}</small>
              <i>LOCKED</i>
            </article>
          ))}
        </div>
      </section>

      <section id="faq" className="story-faq story-reveal" aria-labelledby="faq-title">
        <div className="story-faq-intro">
          <p className="story-section-label">07 / FAQ</p>
          <h2 id="faq-title">
            Preguntas frecuentes
            <br />
            <span>antes de ejecutar.</span>
          </h2>
          <p>
            Si estás empezando, aquí encuentras el contexto necesario para entrar al sistema sin
            ruido.
          </p>
        </div>
        <div className="story-faq-list">
          <details open>
            <summary>
              <span>01</span>
              <b>¿Qué es EdTech?</b>
              <i>+</i>
            </summary>
            <p>
              Una plataforma para aprender tecnología haciendo. Cada ruta combina código,
              herramientas, retos y evidencia de progreso.
            </p>
          </details>
          <details>
            <summary>
              <span>02</span>
              <b>¿Necesito saber programar?</b>
              <i>+</i>
            </summary>
            <p>
              No. Todos empiezan en Python con fundamentos claros y ejercicios pequeños. El
              recorrido aumenta su dificultad cuando ya puedes demostrar el nivel anterior.
            </p>
          </details>
          <details>
            <summary>
              <span>03</span>
              <b>¿Cómo se desbloquean los lenguajes?</b>
              <i>+</i>
            </summary>
            <p>
              Completas lecciones, resuelves evaluaciones y construyes proyectos. Tus resultados
              abren nuevas rutas desde Python hasta sistemas y Assembly.
            </p>
          </details>
          <details>
            <summary>
              <span>04</span>
              <b>¿Mi progreso queda guardado?</b>
              <i>+</i>
            </summary>
            <p>
              Sí. EdTech registra tus checkpoints, cursos, rachas, insignias y certificados para que
              cada sesión continúe donde la dejaste.
            </p>
          </details>
        </div>
      </section>

      <section
        id="contactanos"
        className="story-contact story-reveal"
        aria-labelledby="contact-title"
      >
        <div className="story-contact-copy">
          <p className="story-section-label">08 / CONTACT</p>
          <h2 id="contact-title">
            ¿Tienes una idea?
            <br />
            <span>Hablemos de ella.</span>
          </h2>
          <p>
            Cuéntanos qué quieres aprender, construir o llevar a tu equipo. La siguiente señal puede
            empezar con una línea.
          </p>
          <div className="story-contact-terminal">
            <div>
              <span>edtech@workspace:~$</span>
              <b>open contact.channel</b>
            </div>
            <p>
              channel: <strong>hello@edtech.dev</strong>
            </p>
            <p>
              status: <em>listening</em>
            </p>
          </div>
        </div>
        <form
          className="story-contact-form"
          action="mailto:hello@edtech.dev"
          method="post"
          encType="text/plain"
        >
          <label htmlFor="contact-name">Tu nombre</label>
          <input id="contact-name" name="nombre" type="text" placeholder="Ada Lovelace" required />
          <label htmlFor="contact-email">Tu email</label>
          <input
            id="contact-email"
            name="email"
            type="email"
            placeholder="ada@workspace.dev"
            required
          />
          <label htmlFor="contact-message">Mensaje</label>
          <textarea
            id="contact-message"
            name="mensaje"
            rows={4}
            placeholder="Quiero empezar por..."
            required
          />
          <button type="submit">
            Enviar señal <b>↗</b>
          </button>
          <small>Responderemos desde hello@edtech.dev</small>
        </form>
      </section>

      <section className="story-cta story-reveal">
        <p className="story-section-label">READY / 01</p>
        <h2>
          Tu próximo commit
          <br />
          <span>empieza ahora.</span>
        </h2>
        <a href="/cursos">
          Explorar catálogo <b>↗</b>
        </a>
      </section>
    </section>
  )
}

export default NivelScroll
