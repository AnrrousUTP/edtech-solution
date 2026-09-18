'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type CSSProperties } from 'react'

type Variante = {
  id: number
  nombre: string
  promesa: string
  detalle: string
  tono: string
  tipo: string
  nodos: string[]
  extras: string[]
}

const variantes: Variante[] = [
  {
    id: 1,
    nombre: 'Camino serpenteante',
    promesa: 'El referente más cercano a Duolingo',
    detalle:
      'Nodos grandes, alternados y muy fáciles de leer. Cada paso es una misión y el siguiente aparece al completar el anterior.',
    tono: 'azul',
    tipo: 'snake',
    nodos: ['Test', 'Selectores', 'Colores', 'Reto'],
    extras: ['Racha visible', 'XP por misión', 'Celebración al completar'],
  },
  {
    id: 2,
    nombre: 'Archipiélago de habilidades',
    promesa: 'Cada nivel es una isla que se conquista',
    detalle:
      'El estudiante navega entre islas temáticas. Cada isla agrupa contenido, práctica y un reto final.',
    tono: 'turquesa',
    tipo: 'islands',
    nodos: ['Base', 'Estilos', 'Layout', 'Proyecto'],
    extras: ['Mapa por zonas', 'Insignias por isla', 'Colección de logros'],
  },
  {
    id: 3,
    nombre: 'Ciudad de habilidades',
    promesa: 'Construye una ciudad mientras aprende',
    detalle:
      'Cada tomo levanta un edificio. Las lecciones son pequeñas obras y el proyecto final inaugura el distrito.',
    tono: 'naranja',
    tipo: 'city',
    nodos: ['Parque', 'Taller', 'Estudio', 'Plaza'],
    extras: ['Edificios desbloqueables', 'Coleccionables', 'Progreso visible'],
  },
  {
    id: 4,
    nombre: 'Órbita de aprendizaje',
    promesa: 'Gira alrededor de conceptos conectados',
    detalle:
      'El concepto central es el planeta y cada órbita representa un grupo de habilidades relacionadas.',
    tono: 'violeta',
    tipo: 'orbit',
    nodos: ['Centro', 'Órbita 1', 'Órbita 2', 'Maestría'],
    extras: ['Relaciones entre temas', 'Modo exploración', 'Niveles de dominio'],
  },
  {
    id: 5,
    nombre: 'Expedición de montaña',
    promesa: 'Cada campamento marca una victoria',
    detalle:
      'Una ruta ascendente con campamentos, descansos y una cima que representa el proyecto final.',
    tono: 'verde',
    tipo: 'mountain',
    nodos: ['Campamento', 'Mirador', 'Cumbre', 'Proyecto'],
    extras: ['Reto diario', 'Energía del estudiante', 'Meta final clara'],
  },
  {
    id: 6,
    nombre: 'Línea de metro',
    promesa: 'Viaja por líneas de conocimiento',
    detalle:
      'Cada color es una competencia. El estudiante puede ver dónde está y qué estaciones siguen.',
    tono: 'rojo',
    tipo: 'metro',
    nodos: ['Inicio', 'Sintaxis', 'Diseño', 'Práctica'],
    extras: ['Líneas por competencia', 'Transferencias', 'Vista rápida del avance'],
  },
  {
    id: 7,
    nombre: 'Tablero de misiones',
    promesa: 'Elige tu siguiente desafío',
    detalle:
      'Las misiones aparecen como cartas desbloqueables. Mantiene la sensación de juego sin obligar a un camino único.',
    tono: 'amarillo',
    tipo: 'quests',
    nodos: ['Misión 1', 'Misión 2', 'Misión 3', 'Boss'],
    extras: ['Elección guiada', 'Dificultad visible', 'Recompensas por combo'],
  },
  {
    id: 8,
    nombre: 'Constelación',
    promesa: 'Conecta puntos hasta dominar el tema',
    detalle:
      'Los nodos se conectan como una constelación. Ideal para mostrar rutas opcionales y conceptos relacionados.',
    tono: 'indigo',
    tipo: 'constellation',
    nodos: ['Origen', 'Forma', 'Color', 'Sistema'],
    extras: ['Rutas opcionales', 'Conceptos relacionados', 'Mapa de dominio'],
  },
  {
    id: 9,
    nombre: 'Torre de niveles',
    promesa: 'Sube piso a piso',
    detalle:
      'Cada piso representa un nivel. La escalera muestra la continuidad y los ascensores llevan a repasos.',
    tono: 'rosa',
    tipo: 'tower',
    nodos: ['Piso 1', 'Piso 2', 'Piso 3', 'Azotea'],
    extras: ['Altura como progreso', 'Repasos por piso', 'Trofeo de dominio'],
  },
  {
    id: 10,
    nombre: 'Libro de aventuras',
    promesa: 'Pasa páginas y escribe tu historia',
    detalle:
      'Cada capítulo combina historia, contenido y práctica. El proyecto final cierra el capítulo con una recompensa.',
    tono: 'coral',
    tipo: 'book',
    nodos: ['Prólogo', 'Capítulo 1', 'Capítulo 2', 'Final'],
    extras: ['Narrativa progresiva', 'Personaje guía', 'Recompensa por capítulo'],
  },
]

const posiciones: Record<string, CSSProperties[]> = {
  snake: [
    { left: '12%', bottom: '25%' },
    { left: '40%', top: '22%' },
    { right: '16%', top: '42%' },
    { right: '20%', bottom: '14%' },
  ],
  islands: [
    { left: '11%', bottom: '18%' },
    { left: '42%', top: '18%' },
    { right: '12%', top: '36%' },
    { right: '20%', bottom: '12%' },
  ],
  city: [
    { left: '9%', bottom: '20%' },
    { left: '36%', bottom: '25%' },
    { right: '35%', bottom: '17%' },
    { right: '8%', bottom: '26%' },
  ],
  orbit: [
    { left: '40%', top: '39%' },
    { left: '10%', top: '20%' },
    { right: '7%', top: '30%' },
    { right: '36%', bottom: '8%' },
  ],
  mountain: [
    { left: '8%', bottom: '12%' },
    { left: '34%', bottom: '33%' },
    { right: '27%', top: '28%' },
    { right: '26%', top: '8%' },
  ],
  metro: [
    { left: '5%', top: '38%' },
    { left: '31%', top: '16%' },
    { right: '31%', top: '44%' },
    { right: '5%', top: '22%' },
  ],
  quests: [
    { left: '12%', top: '16%' },
    { left: '39%', top: '52%' },
    { right: '11%', top: '17%' },
    { right: '34%', bottom: '10%' },
  ],
  constellation: [
    { left: '10%', top: '49%' },
    { left: '35%', top: '20%' },
    { right: '28%', top: '54%' },
    { right: '7%', top: '18%' },
  ],
  tower: [
    { left: '10%', bottom: '11%' },
    { left: '39%', bottom: '31%' },
    { right: '10%', bottom: '51%' },
    { right: '38%', top: '7%' },
  ],
  book: [
    { left: '10%', bottom: '18%' },
    { left: '36%', top: '19%' },
    { right: '30%', top: '46%' },
    { right: '8%', bottom: '15%' },
  ],
}

const MiniMapa = ({ variante }: { variante: Variante }): JSX.Element => (
  <div className={`map-demo map-demo-${variante.tipo}`} aria-hidden="true">
    <span className="map-demo-cloud map-demo-cloud-one" />
    <span className="map-demo-cloud map-demo-cloud-two" />
    <span className="map-demo-route" />
    {variante.nodos.map((nodo, index) => (
      <span
        key={nodo}
        className="map-demo-node"
        data-node={index + 1}
        style={posiciones[variante.tipo][index]}
      >
        <b>{index === 0 ? '✓' : String(index + 1).padStart(2, '0')}</b>
        <small>{nodo}</small>
      </span>
    ))}
    <span className="map-demo-flag">META</span>
  </div>
)

export default function EjemplosMapa(): JSX.Element {
  const [seleccionada, setSeleccionada] = useState(0)
  const pathname = usePathname()
  const cursoSlug = pathname.split('/').filter(Boolean)[1] ?? 'css-desde-cero'
  const variante = variantes[seleccionada]

  return (
    <main className="map-gallery-page">
      <div className="map-gallery-shell">
        <div className="map-gallery-topbar">
          <Link href={`/aprender/${cursoSlug}`} className="map-gallery-back">
            ← Volver al curso
          </Link>
          <span className="map-gallery-label">LABORATORIO DE DISEÑO · 10 CONCEPTOS</span>
        </div>

        <header className="map-gallery-hero">
          <p className="course-map-kicker">ANTES DE ELEGIR EL CAMINO</p>
          <h1>Diez formas de convertir tu ruta en un juego</h1>
          <p>
            La página actual tiene una estructura correcta, pero todavía se siente como un listado
            porque cada tomo es una tarjeta con filas. Aquí puedes comparar diez metáforas visuales
            y escoger la que llevaremos a producción.
          </p>
        </header>

        <section className="map-gallery-featured" aria-live="polite">
          <div className="map-gallery-featured-preview">
            <MiniMapa variante={variante} />
          </div>
          <div className="map-gallery-featured-copy">
            <p className="map-gallery-number">EJEMPLO {String(variante.id).padStart(2, '0')}</p>
            <h2>{variante.nombre}</h2>
            <p className="map-gallery-promise">{variante.promesa}</p>
            <p>{variante.detalle}</p>
            <div className="map-gallery-tags">
              {variante.extras.map(extra => (
                <span key={extra}>{extra}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="map-gallery-grid" aria-label="Ejemplos de mapas gamificados">
          {variantes.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`map-gallery-card ${index === seleccionada ? 'is-selected' : ''}`}
              onClick={() => setSeleccionada(index)}
              aria-pressed={index === seleccionada}
            >
              <MiniMapa variante={item} />
              <span className="map-gallery-card-copy">
                <strong>
                  {String(item.id).padStart(2, '0')} · {item.nombre}
                </strong>
                <small>{item.promesa}</small>
              </span>
              <span className="map-gallery-card-action">Ver concepto →</span>
            </button>
          ))}
        </section>

        <footer className="map-gallery-footer">
          <span>
            La recomendación inicial es el <strong>Ejemplo 01</strong>: conserva la lectura vertical
            tipo Duolingo, pero cambia las filas por misiones con estados, recompensas y animaciones
            breves.
          </span>
          <Link href={`/aprender/${cursoSlug}`} className="boton-primario">
            Volver al mapa
          </Link>
        </footer>
      </div>
    </main>
  )
}
