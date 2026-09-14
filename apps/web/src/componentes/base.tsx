import Link from 'next/link'
import type { ReactNode } from 'react'

// D19 en todo el fichero: el hover cambia color, borde y opacidad. Nunca
// transform, translate ni scale.

export const Etiqueta = ({
  children,
  tono = 'neutro',
}: {
  children: ReactNode
  tono?: 'neutro' | 'marca' | 'exito' | 'acento' | 'alerta'
}): JSX.Element => {
  const tonos = {
    neutro: 'tech-badge-neutral',
    marca: 'tech-badge-blue',
    exito: 'tech-badge-green',
    acento: 'tech-badge-yellow',
    alerta: 'tech-badge-red',
  }
  return <span className={`etiqueta ${tonos[tono]}`}>{children}</span>
}

export const BarraProgreso = ({
  valor,
  total,
  etiqueta,
}: {
  valor: number
  total: number
  etiqueta?: string
}): JSX.Element => {
  const porcentaje = total === 0 ? 0 : Math.round((valor / total) * 100)
  return (
    <div>
      {etiqueta && (
        <div className="mb-1 flex justify-between text-xs font-bold text-slate-600">
          <span>{etiqueta}</span>
          <span>
            {valor}/{total}
          </span>
        </div>
      )}
      <div
        className="tech-progress-track h-2.5 w-full overflow-hidden rounded-lg"
        role="progressbar"
        aria-valuenow={porcentaje}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={etiqueta ?? 'Progreso'}
      >
        <div
          className="tech-progress-fill h-full rounded-lg transition-[width] duration-300"
          style={{ width: `${porcentaje}%` }}
        />
      </div>
    </div>
  )
}

export const Racha = ({ dias }: { dias: number }): JSX.Element => {
  // El color cambia con la racha; no hay rebote ni movimiento (D19)
  const tono =
    dias >= 30
      ? 'bg-acento-400 text-white'
      : dias >= 7
        ? 'bg-acento-100 text-acento-600'
        : 'bg-slate-100 text-slate-600'
  return (
    <span
      className={`tech-streak inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${tono}`}
      title={`Racha de ${dias} ${dias === 1 ? 'día' : 'días'}`}
    >
      <span aria-hidden="true">🔥</span>
      <span>{dias}</span>
      <span className="sr-only">días de racha</span>
    </span>
  )
}

export const Vacio = ({
  titulo,
  detalle,
  accion,
}: {
  titulo: string
  detalle: string
  accion?: { texto: string; href: string }
}): JSX.Element => (
  <div className="tarjeta tech-empty p-10 text-center">
    <p className="text-lg font-bold text-slate-800">{titulo}</p>
    <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{detalle}</p>
    {accion && (
      <Link href={accion.href} className="boton-primario mt-5">
        {accion.texto}
      </Link>
    )}
  </div>
)

/** Estados de error DE VERDAD, con acción (doc 11 §5). */
export const ErrorConAccion = ({
  titulo,
  detalle,
  accion,
}: {
  titulo: string
  detalle: string
  accion: { texto: string; href: string }
}): JSX.Element => (
  <div className="tarjeta tech-error border-alerta-500/30 p-8 text-center">
    <p className="text-lg font-bold text-alerta-700">{titulo}</p>
    <p className="mx-auto mt-2 max-w-md text-sm text-slate-700">{detalle}</p>
    <Link href={accion.href} className="boton-secundario mt-5">
      {accion.texto}
    </Link>
  </div>
)

/** Skeleton con la FORMA del contenido, no un spinner genérico (doc 11 §5). */
export const EsqueletoTarjetas = ({ cantidad = 3 }: { cantidad?: number }): JSX.Element => (
  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-live="polite">
    {Array.from({ length: cantidad }, (_, i) => (
      <div key={i} className="tarjeta p-5">
        <div className="h-4 w-20 rounded bg-slate-200" />
        <div className="mt-3 h-6 w-3/4 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-full rounded bg-slate-100" />
        <div className="mt-1.5 h-4 w-2/3 rounded bg-slate-100" />
      </div>
    ))}
    <span className="sr-only">Cargando contenido…</span>
  </div>
)

export const precioTexto = (precio: number, moneda: string): string =>
  precio === 0 ? 'Gratis' : `${moneda} ${precio.toFixed(2)}`

const TRAMOS: { nombre: string; niveles: string[] }[] = [
  { nombre: 'Fundamentos', niveles: ['A', 'B', 'C', 'D'] },
  { nombre: 'Intermedio', niveles: ['E', 'F', 'G', 'H'] },
  { nombre: 'Avanzado', niveles: ['I', 'J', 'K'] },
  { nombre: 'Profesional', niveles: ['L', 'M', 'N'] },
]

/** El tramo es lo que ve el estudiante; la letra, lo que usa el motor (doc 02 §2). */
export const tramoDe = (nivel: string): string =>
  TRAMOS.find(t => t.niveles.includes(nivel.toUpperCase()))?.nombre ?? 'Fundamentos'

export const NivelBadge = ({ nivel }: { nivel: string }): JSX.Element => (
  <Etiqueta tono="marca">
    {tramoDe(nivel)} · {nivel.toUpperCase()}
  </Etiqueta>
)
