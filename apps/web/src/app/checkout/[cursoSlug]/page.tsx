import { notFound } from 'next/navigation'
import { catalogApi } from '@/api/catalog'
import { ErrorConAccion, precioTexto } from '@/componentes/base'
import { perfilSesion } from '@/lib/sesion'
import { Checkout } from './checkout'

// Pantalla 9: checkout con PayPal y espera honesta de la habilitación.
const PaginaCheckout = async ({
  params,
}: {
  params: Promise<{ cursoSlug: string }>
}): Promise<JSX.Element> => {
  const { cursoSlug } = await params
  const perfil = await perfilSesion()
  if (!perfil) {
    return (
      <ErrorConAccion
        titulo="Entra para completar la compra"
        detalle="Necesitamos tu cuenta para vincular el curso a tu progreso."
        accion={{ texto: 'Entrar', href: `/api/auth/login?destino=/checkout/${cursoSlug}` }}
      />
    )
  }

  const curso = await catalogApi.curso(cursoSlug)
  if (!curso) notFound()

  if (curso.precio === 0) {
    return (
      <ErrorConAccion
        titulo="Este curso es gratuito"
        detalle="No hace falta pagar: puedes matricularte directamente desde la página del curso."
        accion={{ texto: 'Ir al curso', href: `/cursos/${cursoSlug}` }}
      />
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-3xl font-extrabold text-slate-900">Completar compra</h1>

      <div className="tarjeta mt-6 p-6">
        <p className="text-sm font-bold uppercase text-slate-500">Curso</p>
        <p className="mt-1 text-xl font-bold text-slate-900">{curso.titulo}</p>
        <p className="mt-1 text-sm text-slate-600">
          {curso.tomos.length} tomos · {curso.tomos.reduce((s, t) => s + t.lecciones.length, 0)}{' '}
          lecciones
        </p>

        <div className="mt-5 flex items-baseline justify-between border-t border-slate-200 pt-5">
          <span className="font-bold text-slate-700">Total</span>
          <span className="text-2xl font-extrabold text-marca-600">
            {precioTexto(curso.precio, curso.moneda)}
          </span>
        </div>
      </div>

      <Checkout cursoId={curso.id} cursoSlug={cursoSlug} />
    </div>
  )
}

export default PaginaCheckout
