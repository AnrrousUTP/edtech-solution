// Renderiza los bloques estructurados de una lección. El contenido llega como
// Markdown y bloques (doc 11 §7.4), nunca HTML: es lo que evita un WebView
// cuando llegue la app móvil.
type Bloque = { orden: number; tipo: string; contenido: Record<string, unknown> }

/** Markdown mínimo y seguro: encabezados, negrita, código en línea y listas.
 *  No se inyecta HTML del servidor — cada trozo se emite como texto. */
const lineasDeMarkdown = (texto: string): JSX.Element[] =>
  texto.split('\n').map((linea, i) => {
    if (linea.startsWith('### '))
      return (
        <h4 key={i} className="mt-4 font-bold text-slate-900">
          {linea.slice(4)}
        </h4>
      )
    if (linea.startsWith('## '))
      return (
        <h3 key={i} className="mt-5 text-lg font-bold text-slate-900">
          {linea.slice(3)}
        </h3>
      )
    if (linea.startsWith('# '))
      return (
        <h2 key={i} className="mt-6 text-xl font-extrabold text-slate-900">
          {linea.slice(2)}
        </h2>
      )
    if (linea.startsWith('- '))
      return (
        <li key={i} className="ml-5 list-disc text-slate-700">
          {linea.slice(2)}
        </li>
      )
    if (!linea.trim()) return <div key={i} className="h-2" />
    return (
      <p key={i} className="text-slate-700">
        {linea}
      </p>
    )
  })

export const RenderBloque = ({ bloque }: { bloque: Bloque }): JSX.Element => {
  const contenido = bloque.contenido

  if (bloque.tipo === 'CODIGO') {
    const lenguaje = String(contenido.lenguaje ?? 'texto')
    return (
      // <pre><code> con lang, nunca una imagen (doc 11 §6)
      <pre
        className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm text-slate-100"
        lang={lenguaje}
      >
        <code>{String(contenido.codigo ?? '')}</code>
      </pre>
    )
  }

  if (bloque.tipo === 'CALLOUT') {
    return (
      <aside className="rounded-lg border-l-4 border-marca-600 bg-marca-50 p-4">
        <div className="space-y-1 text-sm">
          {lineasDeMarkdown(String(contenido.markdown ?? ''))}
        </div>
      </aside>
    )
  }

  if (bloque.tipo === 'VIDEO') {
    return (
      <div className="rounded-lg bg-slate-100 p-4 text-sm text-slate-600">
        Video: <span className="font-mono">{String(contenido.s3_key ?? 'sin clave')}</span>
      </div>
    )
  }

  if (bloque.tipo === 'IMAGEN') {
    const src = String(contenido.url ?? contenido.s3_key ?? '')
    return src.startsWith('http') ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={String(contenido.alt ?? '')} className="rounded-lg" />
    ) : (
      <div className="rounded-lg bg-slate-100 p-4 text-sm text-slate-600">Imagen: {src}</div>
    )
  }

  return <div className="space-y-1">{lineasDeMarkdown(String(contenido.markdown ?? ''))}</div>
}
