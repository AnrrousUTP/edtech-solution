import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { Etiqueta, NivelBadge, precioTexto } from '@/componentes/base'

// Pantalla 1: landing. Server Component — sin JS de cliente.
const Landing = async (): Promise<JSX.Element> => {
  const [cursos, carreras] = await Promise.all([
    catalogApi.cursos().catch(() => []),
    catalogApi.carreras().catch(() => []),
  ])

  return (
    <div className="space-y-14">
      <section className="text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight text-slate-900 sm:text-5xl">
          Aprende a programar <span className="text-marca-600">por niveles</span>, no por videos
          sueltos
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          Empieza donde estás de verdad. Un test corto te ubica en tu nivel, y desde ahí avanzas con
          rachas, insignias y certificados que sí pesan en un currículum.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/nivelacion" className="boton-primario">
            Hacer el test de nivelación
          </Link>
          <Link href="/cursos" className="boton-secundario">
            Ver el catálogo
          </Link>
        </div>
      </section>

      {carreras.length > 0 && (
        <section>
          <h2 className="text-2xl font-extrabold text-slate-900">Carreras</h2>
          <p className="mt-1 text-slate-600">
            Una ruta ordenada de cursos. Al completarla, certificado mayor.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {carreras.map(carrera => (
              <article key={carrera.id} className="tarjeta p-6">
                <Etiqueta tono="acento">{carrera.cursos.length} cursos</Etiqueta>
                <h3 className="mt-3 text-xl font-bold text-slate-900">{carrera.titulo}</h3>
                <p className="mt-2 text-sm text-slate-600">{carrera.descripcion}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">Cursos destacados</h2>
            <p className="mt-1 text-slate-600">HTML, CSS y Express para empezar.</p>
          </div>
          <Link
            href="/cursos"
            className="text-sm font-bold text-marca-600 transition-colors hover:text-marca-700"
          >
            Ver todos
          </Link>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cursos.slice(0, 3).map(curso => (
            <Link
              key={curso.id}
              href={`/cursos/${curso.slug}`}
              className="tarjeta-interactiva block p-5"
            >
              <div className="flex items-center gap-2">
                <Etiqueta>{curso.tecnologia}</Etiqueta>
                <NivelBadge nivel={curso.nivelMin} />
              </div>
              <h3 className="mt-3 text-lg font-bold text-slate-900">{curso.titulo}</h3>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600">{curso.descripcion}</p>
              <p className="mt-4 font-extrabold text-marca-600">
                {precioTexto(curso.precio, curso.moneda)}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-5 sm:grid-cols-3">
        {[
          {
            titulo: 'Progresión real',
            texto: '14 niveles en 4 tramos. El nivel solo sube: nunca te castiga por fallar.',
          },
          {
            titulo: 'Repaso con IA revisada',
            texto: 'Flashcards generadas por IA y aprobadas por una persona antes de llegar a ti.',
          },
          {
            titulo: 'Certificados verificables',
            texto: 'Cada certificado tiene un código público que cualquiera puede comprobar.',
          },
        ].map(item => (
          <div key={item.titulo} className="tarjeta p-6">
            <h3 className="font-bold text-slate-900">{item.titulo}</h3>
            <p className="mt-2 text-sm text-slate-600">{item.texto}</p>
          </div>
        ))}
      </section>
    </div>
  )
}

export default Landing
