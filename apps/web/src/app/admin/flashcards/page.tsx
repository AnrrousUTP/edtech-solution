import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { flashcardsApi } from '@/api/resto'
import { Etiqueta } from '@/componentes/base'

export default async function PaginaRevisionFlashcards(): Promise<JSX.Element> {
  const cursos = await catalogApi.cursosAdmin().catch(() => [])
  const filas = await Promise.all(
    cursos.map(async curso => {
      const detalle = await catalogApi.cursoAdmin(curso.id).catch(() => null)
      const mazos = await Promise.all(
        (detalle?.tomos ?? []).map(
          async tomo => (await flashcardsApi.mazosAdmin(tomo.id).catch(() => [])) ?? [],
        ),
      )
      const tarjetas = mazos.flatMap(mazosDeTomo => mazosDeTomo.flatMap(mazo => mazo.tarjetas))
      return {
        curso,
        tomos: detalle?.tomos.length ?? 0,
        mazos: mazos.flat().length,
        pendientes: tarjetas.filter(tarjeta => tarjeta.estado !== 'PUBLICADA').length,
      }
    }),
  )

  return (
    <section className="tech-admin-page">
      <header>
        <p className="mb-2 text-sm font-bold uppercase tracking-[0.12em] text-marca-700">
          Área docente
        </p>
        <h1 className="admin-title">Revisión de flashcards</h1>
        <p className="admin-lead">
          Revisa y gestiona las tarjetas de todos los cursos desde su contenido.
        </p>
      </header>

      {filas.length === 0 ? (
        <p className="admin-help mt-6">Aún no hay cursos para revisar.</p>
      ) : (
        <div className="admin-course-grid mt-6">
          {filas.map(({ curso, tomos, mazos, pendientes }) => (
            <article className="admin-course-card" key={curso.id}>
              <div className="admin-course-card-topline">
                <span className="admin-course-tech">{curso.tecnologia}</span>
                <Etiqueta tono={pendientes > 0 ? 'alerta' : 'exito'}>
                  {pendientes} pendientes
                </Etiqueta>
              </div>
              <h2>{curso.titulo}</h2>
              <p className="admin-course-description">
                {tomos} tomos · {mazos} mazos
              </p>
              <Link
                className="boton-secundario mt-4 inline-flex"
                href={`/admin/cursos/${curso.id}`}
              >
                Revisar curso
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
