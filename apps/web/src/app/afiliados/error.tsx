'use client'
export default function ErrorPage({ reset }: { reset: () => void }): JSX.Element {
  return (
    <div className="affiliate-card affiliate-empty" role="alert">
      <h2>No pudimos cargar esta sección</h2>
      <p>Comprueba tu sesión y vuelve a intentarlo.</p>
      <button className="boton-primario" onClick={reset}>
        Reintentar
      </button>
      <a className="boton-secundario" href="/login?destino=/afiliados">
        Iniciar sesión
      </a>
    </div>
  )
}
