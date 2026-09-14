import { catalogApi } from '@/api/catalog'
import { ErrorConAccion, Vacio } from '@/componentes/base'
import { Examen } from '@/componentes/examen'
import { perfilSesion } from '@/lib/sesion'

export default async function Diagnostico(): Promise<JSX.Element> {
  if (!(await perfilSesion()))
    return (
      <ErrorConAccion
        titulo="Entra para conocer tu punto de partida"
        detalle="Guardaremos el resultado para que puedas elegir una ruta con mejor contexto."
        accion={{ texto: 'Entrar', href: '/login?destino=/diagnostico' }}
      />
    )
  const banco = await catalogApi.diagnostico()
  if (!banco || banco.preguntas.length === 0)
    return (
      <Vacio
        titulo="El diagnóstico todavía no está disponible"
        detalle="Puedes comenzar por el test de nivelación o explorar el catálogo."
        accion={{ texto: 'Ver nivelación', href: '/nivelacion' }}
      />
    )
  return (
    <div className="tech-level-test">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <p className="text-sm text-slate-600">
          Responde sin presión. Este diagnóstico sirve para detectar qué conviene reforzar antes de
          entrar a una ruta.
        </p>
      </div>
      <Examen
        titulo="Diagnóstico previo"
        preguntas={banco.preguntas}
        bancoId={banco.bancoId}
        tipo="DIAGNOSTICO_PREVIO"
        umbral={banco.umbral}
        volverA="/cursos"
      />
    </div>
  )
}
