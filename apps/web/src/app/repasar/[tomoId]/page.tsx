import { flashcardsApi } from '@/api/resto'
import { Vacio } from '@/componentes/base'
import { Mazo } from './mazo'

// Pantalla 8: repaso con flashcards. Si el mazo está en revisión, el estudiante
// ve 0 tarjetas (I-8) y se le dice la verdad, no un error.
const Repasar = async ({
  params,
}: {
  params: Promise<{ tomoId: string }>
}): Promise<JSX.Element> => {
  const { tomoId } = await params
  const tarjetas = await flashcardsApi.tarjetasDeTomo(tomoId)

  if (!tarjetas || tarjetas.length === 0) {
    return (
      <Vacio
        titulo="Todavía no hay flashcards para este tomo"
        detalle="Las tarjetas se generan a partir del contenido y una persona las revisa antes de publicarlas. Vuelve en un rato."
        accion={{ texto: 'Volver a mi panel', href: '/dashboard' }}
      />
    )
  }

  return <Mazo tarjetas={tarjetas} />
}

export default Repasar
