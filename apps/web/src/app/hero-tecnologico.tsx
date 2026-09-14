'use client'

import { useState, type CSSProperties } from 'react'

type CodeTone = 'keyword' | 'function' | 'string' | 'comment' | 'number' | 'operator'

type CodePart = {
  text: string
  tone?: CodeTone
}

type CodeLine = {
  parts: CodePart[]
}

type LanguageTheme = {
  id: string
  nombre: string
  abreviatura: string
  archivo: string
  nivel: string
  accent: string
  accentSoft: string
  glow: string
  prompt: string
  salida: string
  codigo: CodeLine[]
}

const TEMAS: LanguageTheme[] = [
  {
    id: 'python',
    nombre: 'Python',
    abreviatura: 'PY',
    archivo: 'hello.py',
    nivel: 'Inicio',
    accent: '#ffd343',
    accentSoft: '#fff4bf',
    glow: 'rgb(55 118 171 / 0.28)',
    prompt: 'Empieza con una línea.',
    salida: 'Hello, World!',
    codigo: [
      { parts: [{ text: '# tu primer programa', tone: 'comment' }] },
      { parts: [{ text: 'nombre' }, { text: ' = ' }, { text: '"World"', tone: 'string' }] },
      {
        parts: [
          { text: 'print', tone: 'function' },
          { text: '(' },
          { text: 'f"Hello, {nombre}!"', tone: 'string' },
          { text: ')' },
        ],
      },
    ],
  },
  {
    id: 'javascript',
    nombre: 'JavaScript',
    abreviatura: 'JS',
    archivo: 'hello.js',
    nivel: 'Fundamentos',
    accent: '#f7df1e',
    accentSoft: '#fff9b8',
    glow: 'rgb(247 223 30 / 0.2)',
    prompt: 'Haz que las ideas reaccionen.',
    salida: 'Hello, World!',
    codigo: [
      {
        parts: [
          { text: 'const ', tone: 'keyword' },
          { text: 'plataforma' },
          { text: ' = ' },
          { text: '"EdTech"', tone: 'string' },
          { text: ';' },
        ],
      },
      {
        parts: [
          { text: 'console', tone: 'function' },
          { text: '.' },
          { text: 'log', tone: 'function' },
          { text: '(' },
          { text: '"Hello, World!"', tone: 'string' },
          { text: ');' },
        ],
      },
    ],
  },
  {
    id: 'csharp',
    nombre: 'C#',
    abreviatura: 'C#',
    archivo: 'Program.cs',
    nivel: 'Construcción',
    accent: '#5b4bdb',
    accentSoft: '#e4e0ff',
    glow: 'rgb(91 75 219 / 0.28)',
    prompt: 'Construye sistemas que escalan.',
    salida: 'Hello, World!',
    codigo: [
      { parts: [{ text: 'using ', tone: 'keyword' }, { text: 'System;' }] },
      {
        parts: [
          { text: 'Console', tone: 'function' },
          { text: '.' },
          { text: 'WriteLine', tone: 'function' },
          { text: '(' },
          { text: '"Hello, World!"', tone: 'string' },
          { text: ');' },
        ],
      },
    ],
  },
  {
    id: 'ruby',
    nombre: 'Ruby',
    abreviatura: 'RB',
    archivo: 'hello.rb',
    nivel: 'Creatividad',
    accent: '#cc342d',
    accentSoft: '#ffe0dd',
    glow: 'rgb(204 52 45 / 0.24)',
    prompt: 'Escribe código con intención.',
    salida: 'Hello, World!',
    codigo: [
      { parts: [{ text: '# código que se lee como una idea', tone: 'comment' }] },
      {
        parts: [
          { text: 'puts', tone: 'function' },
          { text: ' ' },
          { text: '"Hello, World!"', tone: 'string' },
        ],
      },
    ],
  },
  {
    id: 'go',
    nombre: 'Go',
    abreviatura: 'GO',
    archivo: 'hello.go',
    nivel: 'Sistemas',
    accent: '#00add8',
    accentSoft: '#d8f7ff',
    glow: 'rgb(0 173 216 / 0.25)',
    prompt: 'Piensa rápido. Ejecuta claro.',
    salida: 'Hello, World!',
    codigo: [
      { parts: [{ text: 'package ', tone: 'keyword' }, { text: 'main' }] },
      {
        parts: [
          { text: 'fmt', tone: 'function' },
          { text: '.' },
          { text: 'Println', tone: 'function' },
          { text: '(' },
          { text: '"Hello, World!"', tone: 'string' },
          { text: ')' },
        ],
      },
    ],
  },
  {
    id: 'rust',
    nombre: 'Rust',
    abreviatura: 'RS',
    archivo: 'main.rs',
    nivel: 'Precisión',
    accent: '#dea584',
    accentSoft: '#fff0e6',
    glow: 'rgb(222 165 132 / 0.24)',
    prompt: 'Domina cada detalle.',
    salida: 'Hello, World!',
    codigo: [
      {
        parts: [
          { text: 'fn ', tone: 'keyword' },
          { text: 'main', tone: 'function' },
          { text: '() {' },
        ],
      },
      {
        parts: [
          { text: '    println!', tone: 'function' },
          { text: '(' },
          { text: '"Hello, World!"', tone: 'string' },
          { text: ');' },
        ],
      },
      { parts: [{ text: '}' }] },
    ],
  },
  {
    id: 'assembly',
    nombre: 'Assembly',
    abreviatura: 'ASM',
    archivo: 'hello.asm',
    nivel: 'Hacker',
    accent: '#8df59a',
    accentSoft: '#d9ffe0',
    glow: 'rgb(45 212 108 / 0.2)',
    prompt: 'Baja hasta el metal.',
    salida: 'Hello, World!',
    codigo: [
      {
        parts: [
          { text: 'message db ', tone: 'keyword' },
          { text: '"Hello, World!", 10', tone: 'string' },
        ],
      },
      { parts: [{ text: 'mov ', tone: 'keyword' }, { text: 'edx, message' }] },
      {
        parts: [
          { text: 'mov ', tone: 'keyword' },
          { text: 'eax, 4' },
          { text: '        ' },
          { text: '; syscall', tone: 'comment' },
        ],
      },
      {
        parts: [
          { text: 'int ', tone: 'keyword' },
          { text: '0x80', tone: 'number' },
        ],
      },
    ],
  },
]

const HeroTecnologico = (): JSX.Element => {
  const [temaId, setTemaId] = useState('python')
  const tema = TEMAS.find(item => item.id === temaId) ?? TEMAS[0]
  const themeStyle = {
    '--theme-accent': tema.accent,
    '--theme-accent-soft': tema.accentSoft,
    '--theme-glow': tema.glow,
  } as CSSProperties

  return (
    <section className="tech-hero" style={themeStyle}>
      <div className="tech-hero-themebar">
        <span className="tech-theme-label">
          <span className="tech-live-dot" aria-hidden="true" />
          ENTORNO DE APRENDIZAJE / ELIGE TU LENGUAJE
        </span>
        <div className="tech-theme-selector" role="tablist" aria-label="Seleccionar lenguaje">
          {TEMAS.map(item => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === tema.id}
              className={`tech-theme-button ${item.id === tema.id ? 'is-selected' : ''}`}
              style={{ '--theme-button-color': item.accent } as CSSProperties}
              onClick={() => setTemaId(item.id)}
            >
              <span className="tech-theme-chip" aria-hidden="true">
                {item.abreviatura}
              </span>
              <span>{item.nombre}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="tech-hero-grid">
        <div className="tech-hero-copy">
          <div className="tech-kicker">
            EDTECH / {tema.nivel.toUpperCase()} / {tema.nombre.toUpperCase()}
          </div>
          <h1 className="tech-title">
            Bienvenido al
            <span>lado del código.</span>
          </h1>
          <p className="tech-hero-text">
            {tema.prompt} Aprende desde tu primer <code>Hello, World!</code> hasta crear sistemas
            que piensan, responden y funcionan.
          </p>
          <form action="/cursos" method="get" className="tech-search">
            <span className="tech-search-prefix" aria-hidden="true">
              /start
            </span>
            <label htmlFor="buscar" className="sr-only">
              ¿Qué quieres aprender?
            </label>
            <input id="buscar" name="q" type="search" placeholder="¿Qué quieres construir hoy?" />
            <kbd aria-hidden="true">↵</kbd>
            <button type="submit" className="tech-search-button">
              Explorar
            </button>
          </form>
          <div className="tech-hero-links">
            <span>Rutas rápidas</span>
            {['Primer programa', 'Web', 'IA'].map(item => (
              <a key={item} href="#cursos">
                {item}
              </a>
            ))}
          </div>
        </div>

        <div className="tech-hero-visual">
          <div className="tech-code-window">
            <div className="tech-terminal-bar">
              <span className="terminal-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>edtech://{tema.archivo}</span>
              <span className="terminal-status">READY</span>
            </div>
            <div className="tech-code-tabs">
              <span className="tech-code-tab is-active">{tema.archivo}</span>
              <span className="tech-code-level">LEVEL / {tema.nivel.toUpperCase()}</span>
            </div>
            <div className="tech-code-editor" aria-label={`Ejemplo de código en ${tema.nombre}`}>
              {tema.codigo.map((linea, lineIndex) => (
                <div className="tech-code-line" key={`${tema.id}-${lineIndex}`}>
                  <span className="tech-code-number">{String(lineIndex + 1).padStart(2, '0')}</span>
                  <code>
                    {linea.parts.map((part, partIndex) => (
                      <span
                        key={`${lineIndex}-${partIndex}`}
                        className={part.tone ? `syntax-${part.tone}` : undefined}
                      >
                        {part.text}
                      </span>
                    ))}
                  </code>
                </div>
              ))}
              <div className="tech-code-cursor" aria-hidden="true">
                ▋
              </div>
            </div>
            <div className="tech-code-output">
              <span className="tech-output-label">OUTPUT</span>
              <span className="tech-output-prompt">&gt;</span>
              <span>{tema.salida}</span>
              <span className="tech-output-ready">● RUNNING</span>
            </div>
          </div>
        </div>
      </div>

      <div className="tech-stats">
        <div>
          <strong>01</strong>
          <span>lenguaje activo</span>
        </div>
        <div>
          <strong>07</strong>
          <span>niveles de progresión</span>
        </div>
        <div>
          <strong>∞</strong>
          <span>cosas que puedes construir</span>
        </div>
      </div>
    </section>
  )
}

export default HeroTecnologico
