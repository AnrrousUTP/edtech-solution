import { ErrorConAccion } from '@/componentes/base'
import { ResultadoCheckout } from '../resultado'

const PaginaResultadoCheckout = async ({
  searchParams,
}: {
  searchParams: Promise<{ ordenId?: string }>
}): Promise<JSX.Element> => {
  const { ordenId } = await searchParams
  if (!ordenId) {
    return (
      <ErrorConAccion
        titulo="No encontramos la orden"
        detalle="Vuelve al catálogo para revisar tus cursos."
        accion={{ texto: 'Ver cursos', href: '/cursos' }}
      />
    )
  }
  return <ResultadoCheckout ordenId={ordenId} />
}

export default PaginaResultadoCheckout
