'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
export const pedir = async (path: string, method = 'POST', body: unknown = {}): Promise<void> => {
  const r = await fetch(`/api/afiliados/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error?.message ?? data.error ?? 'No se pudo completar la acción')
}
export function Accion({
  path,
  texto,
  method = 'POST',
  body = {},
  secondary = false,
}: {
  path: string
  texto: string
  method?: string
  body?: unknown
  secondary?: boolean
}): JSX.Element {
  const [loading, setLoading] = useState(false),
    [error, setError] = useState('')
  const router = useRouter()
  return (
    <div>
      <button
        className={secondary ? 'boton-secundario' : 'boton-primario'}
        disabled={loading}
        onClick={async () => {
          setLoading(true)
          setError('')
          try {
            await pedir(path, method, body)
            router.refresh()
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Intenta nuevamente')
          } finally {
            setLoading(false)
          }
        }}
      >
        {loading ? 'Procesando…' : texto}
      </button>
      {error && (
        <p role="alert" className="affiliate-error">
          {error}
        </p>
      )}
    </div>
  )
}
export function AutoActualizar(): null {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 10000)
    return () => clearInterval(t)
  }, [router])
  return null
}
export function Compartir({ url }: { url: string }): JSX.Element {
  const [mensaje, setMensaje] = useState('')
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setMensaje('Enlace copiado')
    } catch {
      setMensaje('Selecciona el enlace y cópialo para compartirlo.')
    }
  }
  return (
    <div className="affiliate-share">
      <label htmlFor="affiliate-link">Tu enlace personal</label>
      <input id="affiliate-link" readOnly value={url} onFocus={e => e.target.select()} />
      <div className="affiliate-actions">
        <button className="boton-primario" onClick={() => void copiar()}>
          Copiar enlace
        </button>
        <button
          className="boton-secundario"
          onClick={async () => {
            try {
              if (navigator.share) await navigator.share({ title: 'Aprende con EdTech', url })
              else await copiar()
            } catch {
              setMensaje('Puedes copiar el enlace para compartirlo.')
            }
          }}
        >
          Compartir
        </button>
      </div>
      <p role="status">{mensaje}</p>
    </div>
  )
}
export function DestinoQr({
  slug,
  cursos,
}: {
  slug: string | null
  cursos: { id: string; slug: string; titulo: string }[]
}): JSX.Element {
  const [valor, setValor] = useState(slug ?? ''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false)
  const router = useRouter()
  return (
    <form
      onSubmit={async e => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
          await pedir('configuracion', 'PUT', { cursoSlug: valor || null })
          router.refresh()
        } catch (err) {
          setError(String(err))
        } finally {
          setLoading(false)
        }
      }}
      className="affiliate-form"
    >
      <label htmlFor="qr-destino">Qué verá quien abra tu enlace</label>
      <select id="qr-destino" value={valor} onChange={e => setValor(e.target.value)}>
        <option value="">Catálogo de cursos</option>
        {cursos.map(c => (
          <option key={c.id} value={c.slug}>
            {c.titulo}
          </option>
        ))}
      </select>
      <p>El QR conserva el mismo enlace cuando cambias el curso recomendado.</p>
      <button className="boton-secundario" disabled={loading}>
        {loading ? 'Guardando…' : 'Guardar destino'}
      </button>
      {error && (
        <p role="alert" className="affiliate-error">
          {error}
        </p>
      )}
    </form>
  )
}
export function ConfigurarTerminal({
  mensaje,
  habilitado,
  version,
}: {
  mensaje: string
  habilitado: boolean
  version: number
}): JSX.Element {
  const [texto, setTexto] = useState(mensaje),
    [activo, setActivo] = useState(habilitado),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false)
  const router = useRouter()
  useEffect(() => {
    setTexto(mensaje)
    setActivo(habilitado)
  }, [mensaje, habilitado])
  return (
    <form
      className="affiliate-form"
      onSubmit={async e => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
          await pedir('terminal', 'PUT', { mensaje: texto, habilitado: activo, version })
          router.refresh()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'No se pudo guardar')
        } finally {
          setLoading(false)
        }
      }}
    >
      <label htmlFor="terminal-mensaje">Mensaje promocional</label>
      <input
        id="terminal-mensaje"
        maxLength={160}
        required
        value={texto}
        onChange={e => setTexto(e.target.value)}
      />
      <label className="affiliate-check">
        <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />
        Mostrar la promoción
      </label>
      <button className="boton-primario" disabled={loading}>
        {loading ? 'Guardando…' : 'Actualizar terminal'}
      </button>
      {error && (
        <p role="alert" className="affiliate-error">
          {error}
        </p>
      )}
    </form>
  )
}
export function AsignarTerminal({
  afiliados,
  usuarioId,
}: {
  afiliados: { usuarioId: string; refId: string }[]
  usuarioId: string | null
}): JSX.Element {
  const [id, setId] = useState(usuarioId ?? '')
  return (
    <div className="affiliate-form">
      <label htmlFor="asignar-terminal">Afiliado del terminal de demostración</label>
      <select id="asignar-terminal" value={id} onChange={e => setId(e.target.value)}>
        <option value="">Sin asignación</option>
        {afiliados.map(a => (
          <option key={a.usuarioId} value={a.usuarioId}>
            Afiliado {a.refId.slice(0, 8)}
          </option>
        ))}
      </select>
      <Accion
        path="admin/terminales/asignacion"
        method="PUT"
        body={{ usuarioId: id || null }}
        texto="Guardar asignación"
      />
    </div>
  )
}
