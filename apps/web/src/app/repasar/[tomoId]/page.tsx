import { flashcardsApi } from '@/api/resto'
import { catalogApi } from '@/api/catalog'
import { enrollmentApi } from '@/api/enrollment'
import { ErrorConAccion, Vacio } from '@/componentes/base'
import { Mazo } from './mazo'

// Pantalla 8: repaso con flashcards. Si el mazo está en revisión, el estudiante
// ve 0 tarjetas (I-8) y se le dice la verdad, no un error.
const Repasar = async ({
  params,
}: {
  params: Promise<{ tomoId: string }>
}): Promise<JSX.Element> => {
  const { tomoId } = await params
  const contexto = await catalogApi.contextoDeTomo(tomoId)
  if (!contexto) {
    return (
      <Vacio
        titulo="Este tomo no está disponible"
        detalle="No encontramos una ruta publicada para este repaso."
        accion={{ texto: 'Volver al catálogo', href: '/cursos' }}
      />
    )
  }
  const progreso = await enrollmentApi.progreso(contexto.cursoId)
  if (!progreso) {
    return (
      <ErrorConAccion
        titulo="Necesitas estar matriculado"
        detalle="Las flashcards forman parte del recorrido del curso. Matricúlate para abrir este repaso."
        accion={{ texto: 'Ver el curso', href: `/cursos/${contexto.cursoSlug}` }}
      />
    )
  }
  const tarjetas = await flashcardsApi.tarjetasDeTomo(tomoId)

  if (!tarjetas || tarjetas.length === 0) {
    return (
      <Vacio
        titulo="Todavía no hay flashcards para este tomo"
        detalle="Las tarjetas se generan a partir del contenido y una persona las revisa antes de publicarlas. Vuelve en un rato."
        accion={{ texto: 'Volver al mapa', href: `/aprender/${contexto.cursoSlug}` }}
      />
    )
  }

  return <Mazo tarjetas={tarjetas} />
}

export default Repasar
